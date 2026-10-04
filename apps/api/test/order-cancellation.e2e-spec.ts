import type { INestApplication } from "@nestjs/common"
import { DOMAIN_SCHEMA_VERSION, FAMILY_ENROLLMENT_AGREEMENT_VERSION } from "@linan/contracts"
import { Test } from "@nestjs/testing"
import { randomUUID } from "node:crypto"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { AppModule } from "../src/app.module.js"
import { EnrollmentParticipantEntity, NoticeVersionEntity, OrderEntity, PaymentEntity, WechatFamilySessionEntity } from "../src/domain/entities/index.js"
import { ConfigurationDatabaseService } from "../src/modules/configuration/configuration-database.service.js"
import { EnrollmentAutoNotificationService } from "../src/modules/notifications/enrollment-auto-notification.service.js"
import { loadWechatPayConfig } from "../src/modules/wechat/wechat-config.js"
import { merchantNumber } from "../src/modules/wechat/wechat-crypto.js"
import { WechatPaymentService } from "../src/modules/wechat/wechat-payment.service.js"
import { hashWechatSessionToken } from "../src/modules/wechat/wechat-session-token.js"
import { closeCatalogTripDatabase, createScope, dataSource, databaseUrl, initializeCatalogTripDatabase } from "./catalog-trip-fixture.js"
import { createOrder, createPaidEnrollmentFixture, resetMockPaymentData } from "./mock-payment-fixture.js"
import { createCancellationProvider } from "./order-cancellation-provider.js"

vi.mock("../src/modules/wechat/wechat-config.js", async original => ({
  ...await original<typeof import("../src/modules/wechat/wechat-config.js")>(), loadWechatPayConfig: vi.fn(),
}))

describe.skipIf(databaseUrl === undefined)("Cancel pending orders over HTTP with MySQL locks and a signed local WeChat provider", () => {
  let app: INestApplication, baseUrl: string, scope: string
  let provider: Awaited<ReturnType<typeof createCancellationProvider>>
  let fixture: Awaited<ReturnType<typeof createPaidEnrollmentFixture>>
  let order: Awaited<ReturnType<typeof createOrder>>
  let headers: Record<string, string>
  let paymentNo: string
  const identity = () => ({ familyCode: `family-${scope}`, actorId: `family-${scope}`, phoneVerified: true })
  const cancel = () => request(baseUrl).post(`/orders/${order.id}/cancel`).set(headers).send({})
  const start = () => app.get(WechatPaymentService).startMiniappPayment(identity(), order.id, "fixture-openid")
  const stored = () => dataSource.manager.findOneByOrFail(OrderEntity, { id: order.id })
  const callback = () => {
    const signed = provider.callback(paymentNo, randomUUID(), order.amountFen)
    return request(baseUrl).post("/wechat/payments/callback").set(signed.headers).set("Content-Type", "application/json").send(signed.body)
  }

  beforeAll(async () => {
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
  }, 30_000)

  beforeEach(async () => {
    scope = createScope()
    provider.calls.length = 0
    provider.failure.close = false; provider.failure.closeAfterCommit = false; provider.failure.wrongApp = false
    fixture = await createPaidEnrollmentFixture({ app, scope, family: "cancel" })
    order = await createOrder(app, fixture, randomUUID())
    paymentNo = merchantNumber("payment", order.id)
    const token = randomUUID()
    await dataSource.manager.save(WechatFamilySessionEntity, { id: randomUUID(), familyCode: `family-${scope}`,
      openidHash: hashWechatSessionToken(token), tokenHash: hashWechatSessionToken(token), phoneVerified: true, expiresAt: new Date(Date.now() + 60_000) })
    headers = { Authorization: `Bearer ${token}` }
  })

  afterEach(async () => {
    await dataSource.query("delete from wechat_transactions where order_id = ?", [order.id])
    await dataSource.manager.delete(WechatFamilySessionEntity, { familyCode: `family-${scope}` })
    await resetMockPaymentData(scope)
  })
  afterAll(async () => { await app?.close(); await provider?.close(); await closeCatalogTripDatabase() })

  it("cancels an unpaid order without WeChat and returns the same order on replay", async () => {
    const first = await cancel().expect(201), replay = await cancel().expect(201)
    expect(first.body).toMatchObject({ id: order.id, status: "cancelled", paidFen: 0, amountFen: order.amountFen, participantCount: 2 })
    expect(replay.body).toEqual(first.body)
    expect(provider.calls).toEqual([])
    expect(await dataSource.query("select status from enrollments where id = ?", [fixture.enrollmentId])).toEqual([{ status: "cancelled" }])
    expect(await dataSource.query("select count(*) as count from roster_entries where enrollment_id = ?", [fixture.enrollmentId])).toEqual([{ count: "0" }])
  })

  it("requires a current identity and rejects another family without touching the order", async () => {
    await request(baseUrl).post(`/orders/${order.id}/cancel`).send({}).expect(401)
    await request(baseUrl).post(`/orders/${order.id}/cancel`).set("x-linan-dev-family-identity", "other-family").send({}).expect(404)
    expect((await stored()).status).toBe("pending_payment")
  })

  it("allows the same family to re-enroll the same participants in the same session after cancellation", async () => {
    await cancel().expect(201)
    const people = await dataSource.manager.findBy(EnrollmentParticipantEntity, { enrollmentId: fixture.enrollmentId })
    const notice = await dataSource.manager.findOneByOrFail(NoticeVersionEntity, { tourSessionId: fixture.tourSessionId })
    const enrollment = await request(baseUrl).post("/enrollments").set(headers).send({
      tourSessionId: fixture.tourSessionId, memberIds: people.map(person => person.familyMemberId),
      contactName: "再次报名家长", emergencyContactName: "紧急联系人", emergencyContactPhone: "19999990008",
      agreementVersion: FAMILY_ENROLLMENT_AGREEMENT_VERSION, schemaVersion: DOMAIN_SCHEMA_VERSION,
      noticeVersionId: notice.id, noticeVersion: notice.version,
    }).expect(201)
    expect(enrollment.body.id).not.toBe(fixture.enrollmentId)
    const next = await request(baseUrl).post("/orders").set(headers).send({
      enrollmentId: enrollment.body.id, payerName: "再次报名家长", requestIdempotencyKey: randomUUID(),
    }).expect(201)
    expect(next.body.id).not.toBe(order.id)
    expect(next.body).toMatchObject({ status: "pending_payment", participantCount: 2, amountFen: order.amountFen })
    expect((await stored()).status).toBe("cancelled")
  })

  it("closes a NOTPAY transaction before returning cancelled and blocks further payment", async () => {
    await start()
    await cancel().expect(201)
    expect(provider.states.get(paymentNo)).toBe("CLOSED")
    expect(provider.calls).toEqual(["create", "query", "close"])
    await expect(start()).rejects.toMatchObject({ response: { code: "order_not_payable" } })
  })

  it.each(["SUCCESS", "REFUND"])("does not cancel the order when WeChat reports %s before the callback", async state => {
    await start(); provider.states.set(paymentNo, state)
    const result = await cancel().expect(409)
    expect(result.body.code).toBe("order_not_cancellable")
    expect((await stored()).status).toBe("pending_payment")
    expect(provider.calls).not.toContain("close")
  })

  it.each(["CLOSED", "lost-close-response"])("recognizes an already closed payment: %s", async scenario => {
    await start()
    if (scenario === "CLOSED") provider.states.set(paymentNo, "CLOSED")
    else provider.failure.closeAfterCommit = true
    await cancel().expect(201)
    expect((await stored()).status).toBe("cancelled")
    expect(provider.states.get(paymentNo)).toBe("CLOSED")
  })

  it.each(["ORDER_NOT_EXIST", "USERPAYING", "close-failure", "wrong-merchant"])("keeps the order pending when cancellation is unconfirmed: %s", async scenario => {
    await start()
    if (scenario === "ORDER_NOT_EXIST") provider.states.delete(paymentNo)
    else if (scenario === "USERPAYING") provider.states.set(paymentNo, "USERPAYING")
    else if (scenario === "close-failure") provider.failure.close = true
    else provider.failure.wrongApp = true
    const result = await cancel()
    expect(result.status).toBe(scenario === "wrong-merchant" ? 502 : 409)
    expect((await stored()).status).toBe("pending_payment")
  })

  it("rejects locally settled and refunded orders without calling WeChat", async () => {
    for (const status of ["paid", "refunded"] as const) {
      await dataSource.manager.update(OrderEntity, order.id, { status, paidFen: order.amountFen })
      await cancel().expect(409)
      expect((await stored()).status).toBe(status)
    }
    expect(provider.calls).toEqual([])
  })

  it("waits for provider creation under the same MySQL order lock before closing", async () => {
    const gate = provider.block("create")
    const creating = start()
    await gate.entered
    const cancelling = cancel().then(result => result)
    try { await waitForMysqlLock(); expect(provider.calls).toEqual(["create"]) }
    finally { gate.release() }
    await creating
    expect((await cancelling).status).toBe(201)
    expect(provider.calls).toEqual(["create", "query", "close"])
    expect(provider.states.get(paymentNo)).toBe("CLOSED")
  })

  it("lets a successful payment win while its callback waits for cancellation's lock", async () => {
    await start()
    const gate = provider.block("close"), cancelling = cancel().then(result => result)
    await gate.entered
    provider.states.set(paymentNo, "SUCCESS")
    const settling = callback().then(result => result)
    try { await waitForMysqlLock() } finally { gate.release() }
    expect((await cancelling).status).toBe(409)
    expect((await settling).status).toBe(201)
    expect(await stored()).toMatchObject({ status: "paid", paidFen: order.amountFen })
    expect(await dataSource.manager.findOneByOrFail(PaymentEntity, { orderId: order.id })).toMatchObject({ status: "succeeded" })
    expect(await dataSource.query("select count(*) as count from roster_entries where enrollment_id = ?", [fixture.enrollmentId])).toEqual([{ count: "2" }])
  })

  it("does not initiate provider creation after cancellation has committed", async () => {
    await cancel().expect(201)
    await expect(start()).rejects.toMatchObject({ response: { code: "order_not_payable" } })
    expect(provider.calls).toEqual([])
  })
})

async function waitForMysqlLock(): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const rows: readonly { readonly count: number }[] = await dataSource.query("select count(*) as count from performance_schema.data_lock_waits")
    if (Number(rows[0]?.count) > 0) return
    await new Promise<void>(resolve => setImmediate(resolve))
  }
  throw new Error("expected a real MySQL row-lock wait")
}
