import type { INestApplication } from "@nestjs/common"
import { randomUUID } from "node:crypto"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { PaymentEntity, TourSessionEntity, WechatTransactionEntity } from "../src/domain/entities/index.js"
import { loadWechatPayConfig } from "../src/modules/wechat/wechat-config.js"
import { merchantNumber } from "../src/modules/wechat/wechat-crypto.js"
import { WechatPaymentService } from "../src/modules/wechat/wechat-payment.service.js"
import { closeCatalogTripDatabase, createCatalogTripApp, createScope, dataSource, databaseUrl, initializeCatalogTripDatabase } from "./catalog-trip-fixture.js"
import { type CatalogFixture, createCatalog, createMember, enrollmentBody, familyHeader, virtualPhone } from "./enrollment-consent-fixture.js"
import { createOrder, resetMockPaymentData, startMockPayment } from "./mock-payment-fixture.js"
import { createCancellationProvider } from "./order-cancellation-provider.js"

vi.mock("../src/modules/wechat/wechat-config.js", async original => ({
  ...await original<typeof import("../src/modules/wechat/wechat-config.js")>(), loadWechatPayConfig: vi.fn(),
}))

describe.skipIf(databaseUrl === undefined)("WeChat successful payments competing for the last seat", () => {
  let app: INestApplication, scope: string
  let provider: Awaited<ReturnType<typeof createCancellationProvider>>
  beforeAll(async () => {
    provider = await createCancellationProvider()
    vi.mocked(loadWechatPayConfig).mockReturnValue(provider.config)
    await initializeCatalogTripDatabase()
  }, 120_000)
  beforeEach(async () => { scope = createScope(); app = await createCatalogTripApp() })
  afterEach(async () => {
    await app.close()
    await dataSource.query("delete tx from wechat_transactions tx join orders o on o.id = tx.order_id join enrollments e on e.id = o.enrollment_id join families f on f.id = e.family_id where f.code like ?", [`family-${scope}%`])
    await resetMockPaymentData(scope)
  })
  afterAll(async () => { await provider?.close(); await closeCatalogTripDatabase() })

  it.each(["same-event", "new-event"])("retains both payments and one seat without losing the capacity exception on %s replay", async replay => {
    // Given
    const catalog = await createCatalog(app, scope)
    await dataSource.manager.update(TourSessionEntity, catalog.tourSessionId, { capacity: 1 })
    const first = await pendingOrder(catalog, "first"), second = await pendingOrder(catalog, "second")
    const service = app.get(WechatPaymentService)
    const callbacks = [first, second].map(order => provider.callback(order.paymentNo, randomUUID(), order.amountFen))
    // When
    await Promise.all(callbacks.map(signed => service.handlePaymentCallback(signed.headers, signed.body)))
    const repeated = replay === "same-event" ? callbacks : [first, second].map(order => provider.callback(order.paymentNo, randomUUID(), order.amountFen))
    await Promise.all(repeated.map(signed => service.handlePaymentCallback(signed.headers, signed.body)))
    // Then
    const rows: readonly { readonly status: string; readonly abnormalReason: string | null; readonly orderId: string | null }[] = await dataSource.manager.find(WechatTransactionEntity, { where: { kind: "payment", orderId: first.id } })
    const other = await dataSource.manager.findOneByOrFail(WechatTransactionEntity, { kind: "payment", orderId: second.id })
    const transactions = [...rows, other]
    expect(transactions.filter(tx => tx.status === "succeeded")).toHaveLength(1)
    const rejected = transactions.find(tx => tx.status === "abnormal")
    expect(rejected).toMatchObject({ abnormalReason: "tour_session_full_after_paid" })
    expect(await dataSource.query("select count(*) as count from roster_entries where tour_session_id = ? and status != 'cancelled'", [catalog.tourSessionId])).toEqual([{ count: "1" }])
    expect(await dataSource.query("select status, count(*) as count, sum(paid_fen) as paidFen from orders where id in (?, ?) group by status", [first.id, second.id])).toEqual([{ status: "paid", count: "2", paidFen: String(first.amountFen + second.amountFen) }])
    expect(await dataSource.query("select status, count(*) as count, sum(amount_fen) as amountFen from payments where order_id in (?, ?) group by status", [first.id, second.id])).toEqual([{ status: "succeeded", count: "2", amountFen: String(first.amountFen + second.amountFen) }])
    expect(await dataSource.query("select count(*) as count from payment_events where payment_id in (select id from payments where order_id in (?, ?))", [first.id, second.id])).toEqual([{ count: replay === "same-event" ? "2" : "4" }])
    const availability = await request(app.getHttpServer()).get(`/tour-sessions/${catalog.tourSessionId}/enrollment-availability`).query({ at: "2026-09-22T00:00:00.000Z" }).expect(400)
    expect(availability.body).toMatchObject({ occupiedCapacity: 1, remainingCapacity: 0 })
    expect(provider.calls).toEqual([])
  })

  async function pendingOrder(catalog: CatalogFixture, family: string) {
    const headers = familyHeader(scope, family)
    const member = await createMember({ app, scope, headers, catalog, displayName: `Capacity ${family}`, codeSuffix: family === "first" ? "1" : "2" })
    const enrollment = await request(app.getHttpServer()).post("/enrollments").set(headers).send(enrollmentBody({
      catalog, memberIds: [member.id], contactName: "Capacity Parent", emergencyContactName: "Capacity Emergency", emergencyContactPhone: virtualPhone("0008"),
    })).expect(201)
    const fixture = { headers, enrollmentId: enrollment.body.id, tourSessionId: catalog.tourSessionId, participantIds: [] }
    const order = await createOrder(app, fixture, randomUUID())
    const payment = await startMockPayment(app, fixture, order.id)
    const paymentNo = merchantNumber("payment", order.id)
    await dataSource.manager.update(PaymentEntity, payment.id, { channel: "wechat_pay", paymentNo })
    return { ...order, paymentNo }
  }
})
