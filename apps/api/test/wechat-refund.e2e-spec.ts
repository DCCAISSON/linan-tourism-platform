import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import { randomUUID } from "node:crypto"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { AppModule } from "../src/app.module.js"
import { OrderEntity, OrderLineEntity, PaymentEntity, RefundRequestEntity, WechatTransactionEntity } from "../src/domain/entities/index.js"
import { ConfigurationDatabaseService } from "../src/modules/configuration/configuration-database.service.js"
import { EnrollmentAutoNotificationService } from "../src/modules/notifications/enrollment-auto-notification.service.js"
import { createStaffRefundRequest } from "../src/modules/order/staff-refund.service.js"
import { loadWechatPayConfig } from "../src/modules/wechat/wechat-config.js"
import { merchantNumber } from "../src/modules/wechat/wechat-crypto.js"
import { WechatPaymentService } from "../src/modules/wechat/wechat-payment.service.js"
import { closeCatalogTripDatabase, createScope, dataSource, databaseUrl, initializeCatalogTripDatabase } from "./catalog-trip-fixture.js"
import { createOrder, createPaidEnrollmentFixture, resetMockPaymentData } from "./mock-payment-fixture.js"
import { createCancellationProvider } from "./order-cancellation-provider.js"

vi.mock("../src/modules/wechat/wechat-config.js", async original => ({
  ...await original<typeof import("../src/modules/wechat/wechat-config.js")>(), loadWechatPayConfig: vi.fn(),
}))

describe.skipIf(databaseUrl === undefined)("WeChat refunds over HTTP with MySQL and signed provider responses", () => {
  let app: INestApplication, baseUrl: string, scope: string
  let provider: Awaited<ReturnType<typeof createCancellationProvider>>
  let fixture: Awaited<ReturnType<typeof createPaidEnrollmentFixture>>
  let order: Awaited<ReturnType<typeof createOrder>>
  let staffHeaders: Record<string, string>
  const callback = (number: string, eventId = randomUUID()) => {
    const signed = provider.refundCallback(number, eventId)
    return request(baseUrl).post("/wechat/refunds/callback").set(signed.headers).set("Content-Type", "application/json").send(signed.body)
  }
  const sync = (id: string) => request(baseUrl).post(`/staff/orders/${order.id}/wechat-refunds/${id}/sync`).set(staffHeaders).send({})

  beforeAll(async () => {
    vi.stubEnv("WECHAT_REFUND_ENABLED", "true")
    vi.stubEnv("WECHAT_PAY_ENABLED", "true")
    vi.stubEnv("WECHAT_PAY_MERCHANT_MODE", "direct_confirmed")
    vi.stubEnv("WECHAT_PAY_NOTIFY_URL", "https://example.test/payment")
    vi.stubEnv("WECHAT_PAY_REFUND_NOTIFY_URL", "https://example.test/refund")
    vi.stubEnv("WECHAT_PAY_API_V3_KEY", "12345678901234567890123456789012")
    for (const key of ["WECHAT_MINIAPP_APP_ID", "WECHAT_PAY_MCH_ID", "WECHAT_PAY_SERIAL_NO", "WECHAT_PAY_PRIVATE_KEY_PATH", "WECHAT_PAY_PUBLIC_KEY_ID", "WECHAT_PAY_PUBLIC_KEY_PATH"]) vi.stubEnv(key, "synthetic")
    provider = await createCancellationProvider()
    vi.mocked(loadWechatPayConfig).mockReturnValue(provider.config)
    await initializeCatalogTripDatabase()
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigurationDatabaseService).useValue({ getDataSource: async () => dataSource })
      .overrideProvider(EnrollmentAutoNotificationService).useValue({ enqueueConfirmed: async () => undefined, dispatchAfterConfirmation: () => undefined })
      .compile()
    app = module.createNestApplication({ rawBody: true })
    await app.listen(0, "127.0.0.1")
    baseUrl = await app.getUrl()
  }, 120_000)

  beforeEach(async () => {
    scope = createScope()
    fixture = await createPaidEnrollmentFixture({ app, scope, family: "refund" })
    order = await createOrder(app, fixture, randomUUID())
    const staffId = `staff-${scope}`
    await dataSource.query("insert into staff_accounts (id, username, display_name, password_hash, status, force_password_change, failed_login_attempts, permissions_version, created_at, updated_at) values (?, ?, 'Refund Tester', 'test-hash', 'active', false, 0, 1, current_timestamp(6), current_timestamp(6))", [staffId, staffId])
    staffHeaders = { "x-linan-dev-staff-id": staffId, "x-linan-dev-staff-role": "administrator" }
    await app.get(WechatPaymentService).startMiniappPayment({ familyCode: `family-${scope}`, actorId: `family-${scope}`, phoneVerified: true }, order.id, "fixture-openid")
    const signed = provider.callback(merchantNumber("payment", order.id), randomUUID(), order.amountFen)
    await request(baseUrl).post("/wechat/payments/callback").set(signed.headers).set("Content-Type", "application/json").send(signed.body).expect(201)
    provider.calls.length = 0
  })

  afterEach(async () => {
    await dataSource.query("delete from wechat_transactions where order_id = ?", [order.id])
    await dataSource.query("delete line from refund_request_lines line join refund_requests refund on refund.id = line.refund_request_id where refund.order_id = ?", [order.id])
    await dataSource.query("delete from refund_requests where order_id = ?", [order.id])
    await resetMockPaymentData(scope)
    await dataSource.query("delete from staff_accounts where id = ?", [`staff-${scope}`])
  })
  afterAll(async () => { await app?.close(); await provider?.close(); await closeCatalogTripDatabase(); vi.unstubAllEnvs() })

  it.each(["callback-first", "query-first"])("keeps full refunds successful after duplicate callbacks and queries: %s", async first => {
    // Given
    const refund = await prepareRefund()
    if (first === "callback-first") await callback(refund.number).expect(201)
    else await sync(refund.id).expect(201)
    const before = await moneySnapshot()
    const event = randomUUID()
    // When
    await callback(refund.number, event).expect(201)
    await callback(refund.number, event).expect(201)
    await sync(refund.id).expect(201)
    // Then
    expect(await moneySnapshot()).toEqual(before)
    expect(await transaction(refund.id)).toMatchObject({ status: "succeeded", abnormalReason: null })
    expect(await dataSource.manager.findOneByOrFail(RefundRequestEntity, { id: refund.id })).toMatchObject({ status: "succeeded", failureMessage: null })
    expect(before).toMatchObject({ order: { status: "refunded", paidFen: order.amountFen }, payment: { status: "refunded", amountFen: order.amountFen }, roster: [{ status: "cancelled", count: "2" }], audits: [{ count: "1" }] })
    expect(provider.calls.every(call => call === "refund-query")).toBe(true)
  })

  it("keeps the first partial refund successful when replayed after the second completes the full refund", async () => {
    // Given
    const lines = await dataSource.manager.findBy(OrderLineEntity, { orderId: order.id })
    const firstLine = lines[0], secondLine = lines[1]
    if (firstLine === undefined || secondLine === undefined) throw new TypeError("two participants required")
    const first = await prepareRefund([firstLine.id])
    await callback(first.number).expect(201)
    expect((await moneySnapshot()).roster).toEqual([{ status: "cancelled", count: "1" }, { status: "pending", count: "1" }])
    const second = await prepareRefund([secondLine.id])
    await sync(second.id).expect(201)
    const before = await moneySnapshot()
    // When
    await callback(first.number).expect(201)
    await sync(first.id).expect(201)
    // Then
    expect(await moneySnapshot()).toEqual(before)
    expect(await transaction(first.id)).toMatchObject({ status: "succeeded", abnormalReason: null })
    expect(await transaction(second.id)).toMatchObject({ status: "succeeded", abnormalReason: null })
    expect(before.audits).toEqual([{ count: "2" }])
  })

  it.each(["callback", "query"])("does not overwrite settled success with an earlier PROCESSING result: %s", async entry => {
    // Given
    const refund = await prepareRefund()
    await callback(refund.number).expect(201)
    const before = await moneySnapshot()
    const state = provider.refunds.get(refund.number)
    if (state === undefined) throw new TypeError("refund required")
    state.status = "PROCESSING"
    // When
    if (entry === "callback") await callback(refund.number).expect(201)
    else await sync(refund.id).expect(201)
    // Then
    expect(await transaction(refund.id)).toMatchObject({ status: "succeeded", abnormalReason: null })
    expect(await moneySnapshot()).toEqual(before)
  })

  it.each([
    { entry: "callback", field: "totalFen", reason: "refund_total_mismatch" },
    { entry: "query", field: "totalFen", reason: "refund_total_mismatch" },
    { entry: "callback", field: "refundFen", reason: "refund_amount_mismatch" },
    { entry: "query", field: "refundFen", reason: "refund_amount_mismatch" },
  ] as const)("preserves actual $field mismatch rejection on $entry after full refund", async ({ entry, field, reason }) => {
    // Given
    const refund = await prepareRefund()
    await callback(refund.number).expect(201)
    const before = await moneySnapshot()
    const state = provider.refunds.get(refund.number)
    if (state === undefined) throw new TypeError("refund required")
    state[field] += 1
    // When
    if (entry === "callback") await callback(refund.number).expect(201)
    else await sync(refund.id).expect(201)
    // Then
    expect(await transaction(refund.id)).toMatchObject({ status: "abnormal", abnormalReason: reason })
    expect(await moneySnapshot()).toEqual(before)
  })

  it.each(["callback", "query"])("clears a stale amount warning only after a valid result is verified: %s", async entry => {
    // Given
    const refund = await prepareRefund()
    await callback(refund.number).expect(201)
    const state = provider.refunds.get(refund.number)
    if (state === undefined) throw new TypeError("refund required")
    state.totalFen += 1
    await sync(refund.id).expect(201)
    expect(await transaction(refund.id)).toMatchObject({ status: "abnormal", abnormalReason: "refund_total_mismatch" })
    state.totalFen -= 1
    // When
    if (entry === "callback") await callback(refund.number).expect(201)
    else await sync(refund.id).expect(201)
    // Then
    expect(await transaction(refund.id)).toMatchObject({ status: "succeeded", abnormalReason: null })
    expect(await dataSource.manager.findOneByOrFail(RefundRequestEntity, { id: refund.id })).toMatchObject({ status: "succeeded", failureMessage: null })
  })

  it("keeps the original payment refunded when a late payment-success callback has a new event ID", async () => {
    // Given
    const refund = await prepareRefund()
    await callback(refund.number).expect(201)
    const before = await moneySnapshot()
    const signed = provider.callback(merchantNumber("payment", order.id), randomUUID(), order.amountFen)
    // When
    await request(baseUrl).post("/wechat/payments/callback").set(signed.headers).set("Content-Type", "application/json").send(signed.body).expect(201)
    // Then
    expect(await moneySnapshot()).toEqual(before)
  })

  async function prepareRefund(selected?: readonly string[]) {
    const lines = await dataSource.manager.findBy(OrderLineEntity, { orderId: order.id })
    const refund = await dataSource.transaction(async manager => createStaffRefundRequest(manager,
      await manager.findOneByOrFail(OrderEntity, { id: order.id }),
      { input: { lineIds: selected ?? lines.map(line => line.id), reason: "Synthetic acceptance refund", note: null, idempotencyKey: randomUUID() }, actorId: `staff-${scope}`, provider: "wechat_pay" }))
    const number = merchantNumber("refund", refund.id)
    const storedOrder = await dataSource.manager.findOneByOrFail(OrderEntity, { id: order.id })
    await dataSource.manager.save(WechatTransactionEntity, { id: randomUUID(), organizationId: storedOrder.organizationId,
      kind: "refund", eventId: refund.id, orderId: order.id, refundRequestId: refund.id, outTradeNo: null, outRefundNo: number,
      providerTransactionId: null, status: "processing", amountFen: refund.amountFen, abnormalReason: null, rawPayload: {} })
    provider.refunds.set(number, { status: "SUCCESS", refundFen: refund.amountFen, totalFen: order.amountFen })
    return { id: refund.id, number }
  }

  async function transaction(refundRequestId: string) {
    return dataSource.manager.findOneByOrFail(WechatTransactionEntity, { refundRequestId, kind: "refund" })
  }

  async function moneySnapshot() {
    const storedOrder = await dataSource.manager.findOneByOrFail(OrderEntity, { id: order.id })
    const payment = await dataSource.manager.findOneByOrFail(PaymentEntity, { orderId: order.id })
    return { order: { status: storedOrder.status, amountFen: storedOrder.amountFen, paidFen: storedOrder.paidFen },
      payment: { status: payment.status, amountFen: payment.amountFen },
      refunds: await dataSource.query("select status, amount_fen from refund_requests where order_id = ? order by id", [order.id]),
      roster: await dataSource.query("select status, count(*) as count from roster_entries where enrollment_id = ? group by status order by status", [fixture.enrollmentId]),
      audits: await dataSource.query("select count(*) as count from audit_logs where action = 'refund.provider.succeeded' and target_id in (select id from refund_requests where order_id = ?)", [order.id]) }
  }
})
