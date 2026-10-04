import type { INestApplication } from "@nestjs/common"
import { createCipheriv, generateKeyPairSync, randomBytes, randomUUID, sign } from "node:crypto"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import request from "supertest"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { In } from "typeorm"
import { EnrollmentEntity, FamilyEntity, OrderEntity, UserNotificationAttemptEntity as Attempt, UserNotificationSubscriptionEntity as Subscription,
  UserNotificationTargetEntity as Target, UserNotificationTaskEntity as Task, UserNotificationTemplateEntity as Template, WechatIdentityEntity,
  WechatTransactionEntity, TourSessionEntity, PaymentEntity } from "../src/domain/entities/index.js"
import type { UserTemplateField } from "../src/domain/entities/user-notification.entity.js"
import { EnrollmentAutoNotificationService } from "../src/modules/notifications/enrollment-auto-notification.service.js"
import { UserNotificationDispatchService } from "../src/modules/notifications/user-notification-dispatch.service.js"
import { WechatSubscribeAdapter } from "../src/modules/notifications/wechat-subscribe.adapter.js"
import { merchantNumber } from "../src/modules/wechat/wechat-crypto.js"
import { AppModule } from "../src/app.module.js"
import { Test, type TestingModule } from "@nestjs/testing"
import { closeCatalogTripDatabase, dataSource, databaseUrl, initializeCatalogTripDatabase } from "./catalog-trip-fixture.js"
import { createOrder, createPaidEnrollmentFixture, mockEventBody, resetMockPaymentData, startMockPayment, type PaidEnrollmentFixture } from "./mock-payment-fixture.js"

const enrollmentFields = [
  { key: "thing5", label: "线路名", rule: "thing" },
  { key: "number4", label: "人数", rule: "number" },
  { key: "time1", label: "预约时间", rule: "time" },
] as const

describe.skipIf(databaseUrl === undefined)("enrollment automatic subscription notification", () => {
  let app: INestApplication
  let wechatKeyDir = ""
  let originalWechatEnv: Readonly<Record<string, string | undefined>> = {}
  const scopes: string[] = []
  const templateIds: string[] = []
  const identityHashes: string[] = []

  beforeAll(async () => {
    originalWechatEnv = captureWechatEnv()
    wechatKeyDir = installWechatCallbackKeys()
    await initializeCatalogTripDatabase()
    app = await createRawBodyApp()
  }, 60_000)

  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    await cleanupFixtures()
  })

  afterAll(async () => {
    await cleanupFixtures()
    await app.close()
    await closeCatalogTripDatabase()
    restoreWechatEnv(originalWechatEnv)
    rmSync(wechatKeyDir, { recursive: true, force: true })
  })

  async function cleanupFixtures(): Promise<void> {
    const tasks = templateIds.length === 0 ? [] : await dataSource.manager.findBy(Task, { templateId: In(templateIds) })
    if (tasks.length > 0) {
      await dataSource.manager.delete(Attempt, { taskId: In(tasks.map(task => task.id)) })
      await dataSource.manager.delete(Target, { taskId: In(tasks.map(task => task.id)) })
      await dataSource.manager.delete(Task, { id: In(tasks.map(task => task.id)) })
    }
    if (templateIds.length > 0) {
      await dataSource.manager.delete(Subscription, { templateId: In(templateIds) })
      await dataSource.manager.delete(Template, { id: In(templateIds) })
    }
    if (identityHashes.length > 0) await dataSource.manager.delete(WechatIdentityEntity, { openidHash: In(identityHashes) })
    for (const scope of scopes) {
      await dataSource.query(
        "delete wt from wechat_transactions wt join orders o on o.id = wt.order_id join enrollments e on e.id = o.enrollment_id join families f on f.id = e.family_id where f.code like ?",
        [`family-${scope}%`],
      )
      await resetMockPaymentData(scope)
    }
    templateIds.splice(0)
    identityHashes.splice(0)
    scopes.splice(0)
  }

  async function enrollmentFixture(): Promise<{ readonly fixture: PaidEnrollmentFixture; readonly scope: string }> {
    const scope = `enrollment-auto-${randomUUID()}`
    scopes.push(scope)
    return { fixture: await createPaidEnrollmentFixture({ app, scope, family: "subscriber", participantCount: 2 }), scope }
  }

  async function createRawBodyApp(): Promise<INestApplication> {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile()
    const target = moduleFixture.createNestApplication({ rawBody: true })
    await target.init()
    return target
  }

  async function subscriptionFixture(fixture: PaidEnrollmentFixture, fields: readonly UserTemplateField[] = enrollmentFields): Promise<Template> {
    const enrollment = await dataSource.manager.findOneByOrFail(EnrollmentEntity, { id: fixture.enrollmentId })
    if (enrollment.familyId === null) throw new TypeError("enrollment family fixture is missing")
    const family = await dataSource.manager.findOneByOrFail(FamilyEntity, { id: enrollment.familyId })
    const template = await dataSource.manager.save(Template, {
      id: randomUUID(), title: "预约成功通知", category: "enrollment", templateId: "g4vOTMwPwXZCV636hzQjSsv7SplCumn4LjGADFzB4Fs",
      type: "once", fields: [...fields], enabled: true, updatedBy: "test",
    })
    const openidHash = randomUUID().replaceAll("-", "").padEnd(64, "0")
    templateIds.push(template.id)
    identityHashes.push(openidHash)
    await dataSource.manager.save(WechatIdentityEntity, { openidHash, familyCode: family.code })
    await dataSource.manager.save(Subscription, {
      id: randomUUID(), actorId: openidHash, templateId: template.id, openid: `openid-${randomUUID()}`, status: "active", version: 1,
    })
    return template
  }

  async function confirm(fixture: PaidEnrollmentFixture, scope: string): Promise<{
    readonly orderId: string
    readonly event: ReturnType<typeof mockEventBody>
  }> {
    const order = await createOrder(app, fixture, `order-${scope}`)
    const payment = await startMockPayment(app, fixture, order.id)
    const event = mockEventBody({
      eventId: `event-${scope}`, orderId: order.id, transactionId: `transaction-${scope}`, amountFen: payment.amountFen, status: "succeeded",
    })
    await request(app.getHttpServer()).post("/payments/mock/events").set(fixture.headers).send(event).expect(201)
    return { orderId: order.id, event }
  }

  async function prepareWechatPayment(fixture: PaidEnrollmentFixture, scope: string): Promise<{ readonly orderId: string; readonly amountFen: number; readonly paymentNo: string }> {
    const order = await createOrder(app, fixture, `wechat-order-${scope}`)
    const payment = await startMockPayment(app, fixture, order.id)
    const paymentNo = merchantNumber("payment", order.id)
    await dataSource.manager.update(PaymentEntity, { id: payment.id }, { channel: "wechat_pay", paymentNo })
    return { orderId: order.id, amountFen: payment.amountFen, paymentNo }
  }

  async function sendWechatPaymentCallback(input: { readonly orderId: string; readonly paymentNo: string; readonly amountFen: number; readonly scope: string }): Promise<void> {
    const notification = signedWechatPaymentNotification(input)
    await request(app.getHttpServer()).post("/wechat/payments/callback").set(notification.headers).set("content-type", "application/json").send(notification.body).expect(201, { code: "SUCCESS", message: "OK" })
  }

  it("does not create an automatic task while the enrollment remains pending payment", async () => {
    const { fixture, scope } = await enrollmentFixture()
    const template = await subscriptionFixture(fixture)

    await createOrder(app, fixture, `pending-${scope}`)

    expect(await dataSource.manager.countBy(Task, { templateId: template.id })).toBe(0)
  })

  it("persists one confirmed task and dispatches it once after recovery scanning", async () => {
    vi.stubEnv("WECHAT_SUBSCRIBE_ENABLED", "false")
    const { fixture, scope } = await enrollmentFixture()
    const template = await subscriptionFixture(fixture)

    const { orderId, event } = await confirm(fixture, scope)
    const task = await dataSource.manager.findOneByOrFail(Task, { templateId: template.id })
    expect(task).toMatchObject({ createdBy: "system:enrollment-confirmed", idempotencyKey: `enrollment-confirmed:${orderId}`,
      payloadSnapshot: { page: `pages/orders/detail?orderId=${encodeURIComponent(orderId)}`, data: {
        thing5: { value: expect.any(String) }, number4: { value: "2" }, time1: { value: expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/) },
      } } })
    expect(await dataSource.manager.countBy(Target, { taskId: task.id, status: "pending" })).toBe(1)
    await request(app.getHttpServer()).post("/payments/mock/events").set(fixture.headers).send(event).expect(201)
    expect(await dataSource.manager.countBy(Task, { templateId: template.id })).toBe(1)
    const manualTask = await dataSource.manager.save(Task, {
      id: randomUUID(), templateId: template.id, idempotencyKey: `manual-${randomUUID()}`,
      requestFingerprint: "0".repeat(64), createdBy: "dev-admin",
      payloadSnapshot: { templateId: template.templateId, title: template.title, page: null, data: task.payloadSnapshot.data },
    })
    const subscription = await dataSource.manager.findOneByOrFail(Subscription, { templateId: template.id })
    const manualTarget = await dataSource.manager.save(Target, {
      id: randomUUID(), taskId: manualTask.id, subscriptionId: subscription.id, subscriptionVersion: subscription.version, status: "pending",
    })

    vi.stubEnv("WECHAT_SUBSCRIBE_ENABLED", "true")
    vi.stubEnv("WECHAT_SUBSCRIBE_ACCESS_TOKEN", "fixture-token")
    vi.stubEnv("WECHAT_SUBSCRIBE_API_ORIGIN", "http://127.0.0.1")
    const send = vi.spyOn(app.get(WechatSubscribeAdapter), "send").mockResolvedValue({ status: "api_accepted", errorCode: null, providerMessage: "ok", retryable: false })
    await expect(app.get(UserNotificationDispatchService).sendAutomatic(manualTask.id)).resolves.toBeNull()
    expect(send).not.toHaveBeenCalled()
    expect(await dataSource.manager.findOneByOrFail(Target, { id: manualTarget.id })).toMatchObject({ status: "pending" })
    await app.get(EnrollmentAutoNotificationService).dispatchPending()
    await app.get(EnrollmentAutoNotificationService).dispatchPending()

    expect(send).toHaveBeenCalledTimes(1)
    expect(await dataSource.manager.findOneByOrFail(Target, { taskId: task.id })).toMatchObject({ status: "api_accepted" })
    expect(await dataSource.manager.findOneByOrFail(Target, { id: manualTarget.id })).toMatchObject({ status: "pending" })
  })

  it("skips a configured enrollment template whose semantic fields do not match", async () => {
    vi.stubEnv("WECHAT_SUBSCRIBE_ENABLED", "false")
    const { fixture, scope } = await enrollmentFixture()
    const template = await subscriptionFixture(fixture, [
      { key: "thing5", label: "活动地点", rule: "thing" },
      { key: "number4", label: "人数", rule: "number" },
      { key: "time1", label: "预约时间", rule: "time" },
    ])

    await confirm(fixture, scope)

    expect(await dataSource.manager.countBy(Task, { templateId: template.id })).toBe(0)
  })

  it("does not create a task without an active one-time subscription", async () => {
    vi.stubEnv("WECHAT_SUBSCRIBE_ENABLED", "false")
    const { fixture, scope } = await enrollmentFixture()
    const template = await subscriptionFixture(fixture)
    await dataSource.manager.update(Subscription, { templateId: template.id }, { status: "rejected" })

    await confirm(fixture, scope)

    expect(await dataSource.manager.countBy(Task, { templateId: template.id })).toBe(0)
  })

  it("keeps the confirmed order when delivery is unknown and does not resend it", async () => {
    vi.stubEnv("WECHAT_SUBSCRIBE_ENABLED", "false")
    const { fixture, scope } = await enrollmentFixture()
    await subscriptionFixture(fixture)
    const { orderId } = await confirm(fixture, scope)

    vi.stubEnv("WECHAT_SUBSCRIBE_ENABLED", "true")
    vi.stubEnv("WECHAT_SUBSCRIBE_ACCESS_TOKEN", "fixture-token")
    vi.stubEnv("WECHAT_SUBSCRIBE_API_ORIGIN", "http://127.0.0.1")
    const send = vi.spyOn(app.get(WechatSubscribeAdapter), "send").mockRejectedValue(new TypeError("transport unavailable"))
    await app.get(EnrollmentAutoNotificationService).dispatchPending()
    await app.get(EnrollmentAutoNotificationService).dispatchPending()

    expect(send).toHaveBeenCalledTimes(1)
    expect(await dataSource.manager.findOneByOrFail(OrderEntity, { id: orderId })).toMatchObject({ status: "paid" })
    expect(await dataSource.manager.findOneByOrFail(EnrollmentEntity, { id: fixture.enrollmentId })).toMatchObject({ status: "confirmed" })
    expect(await dataSource.manager.findOneByOrFail(Target, { taskId: (await dataSource.manager.findOneByOrFail(Task, { idempotencyKey: `enrollment-confirmed:${orderId}` })).id })).toMatchObject({ status: "unknown" })
  })

  it("persists an automatic task through the signed and encrypted WeChat payment callback", async () => {
    vi.stubEnv("WECHAT_SUBSCRIBE_ENABLED", "false")
    const { fixture, scope } = await enrollmentFixture()
    const template = await subscriptionFixture(fixture)
    const payment = await prepareWechatPayment(fixture, scope)

    await sendWechatPaymentCallback({ ...payment, scope })

    expect(await dataSource.manager.findOneByOrFail(OrderEntity, { id: payment.orderId })).toMatchObject({ status: "paid" })
    expect(await dataSource.manager.findOneByOrFail(EnrollmentEntity, { id: fixture.enrollmentId })).toMatchObject({ status: "confirmed" })
    expect(await dataSource.manager.findOneByOrFail(Task, { idempotencyKey: `enrollment-confirmed:${payment.orderId}` })).toMatchObject({ templateId: template.id, createdBy: "system:enrollment-confirmed" })
  })

  it("does not create an automatic task when the signed WeChat callback finds capacity exhausted", async () => {
    vi.stubEnv("WECHAT_SUBSCRIBE_ENABLED", "false")
    const { fixture, scope } = await enrollmentFixture()
    const template = await subscriptionFixture(fixture)
    await dataSource.manager.update(TourSessionEntity, { id: fixture.tourSessionId }, { capacity: 1 })
    const payment = await prepareWechatPayment(fixture, scope)

    await sendWechatPaymentCallback({ ...payment, scope })

    expect(await dataSource.manager.findOneByOrFail(WechatTransactionEntity, { outTradeNo: payment.paymentNo })).toMatchObject({ status: "abnormal", abnormalReason: "tour_session_full_after_paid" })
    expect(await dataSource.manager.countBy(Task, { templateId: template.id })).toBe(0)
  })
})

function signedWechatPaymentNotification(input: { readonly paymentNo: string; readonly amountFen: number; readonly scope: string }) {
  const resource = {
    appid: "wechat-enrollment-test-app",
    mchid: "wechat-enrollment-test-merchant",
    out_trade_no: input.paymentNo,
    transaction_id: `wechat-transaction-${input.scope}`,
    trade_state: "SUCCESS",
    amount: { total: input.amountFen, currency: "CNY" },
  }
  const associatedData = "transaction"
  const nonce = randomBytes(12).toString("base64url")
  const cipher = createCipheriv("aes-256-gcm", Buffer.from("01234567890123456789012345678901"), Buffer.from(nonce))
  cipher.setAAD(Buffer.from(associatedData))
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(resource)), cipher.final(), cipher.getAuthTag()])
  const body = JSON.stringify({ id: `wechat-event-${input.scope}`, resource: { algorithm: "AEAD_AES_256_GCM", nonce, associated_data: associatedData, ciphertext: encrypted.toString("base64") } })
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = sign("RSA-SHA256", Buffer.from(`${timestamp}\ncallback-nonce\n${body}\n`), process.env["WECHAT_PAY_TEST_PRIVATE_KEY"] ?? "").toString("base64")
  return { body, headers: { "wechatpay-timestamp": timestamp, "wechatpay-nonce": "callback-nonce", "wechatpay-serial": "enrollment-test-platform", "wechatpay-signature": signature } }
}

function installWechatCallbackKeys(): string {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 })
  const privateKey = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString()
  const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString()
  const directory = mkdtempSync(join(tmpdir(), "linan-enrollment-wechat-"))
  writeFileSync(join(directory, "merchant-private.pem"), privateKey)
  writeFileSync(join(directory, "platform-public.pem"), publicKey)
  process.env["WECHAT_MINIAPP_APP_ID"] = "wechat-enrollment-test-app"
  process.env["WECHAT_PAY_MCH_ID"] = "wechat-enrollment-test-merchant"
  process.env["WECHAT_PAY_SERIAL_NO"] = "enrollment-test-merchant"
  process.env["WECHAT_PAY_PRIVATE_KEY_PATH"] = join(directory, "merchant-private.pem")
  process.env["WECHAT_PAY_PUBLIC_KEY_ID"] = "enrollment-test-platform"
  process.env["WECHAT_PAY_PUBLIC_KEY_PATH"] = join(directory, "platform-public.pem")
  process.env["WECHAT_PAY_API_V3_KEY"] = "01234567890123456789012345678901"
  process.env["WECHAT_PAY_NOTIFY_URL"] = "https://example.test/wechat/payment"
  process.env["WECHAT_PAY_REFUND_NOTIFY_URL"] = "https://example.test/wechat/refund"
  process.env["WECHAT_PAY_ENABLED"] = "true"
  process.env["WECHAT_PAY_MERCHANT_MODE"] = "direct_confirmed"
  process.env["WECHAT_PAY_TEST_PRIVATE_KEY"] = privateKey
  return directory
}

function captureWechatEnv(): Readonly<Record<string, string | undefined>> {
  return Object.fromEntries(wechatEnvKeys().map(key => [key, process.env[key]]))
}

function restoreWechatEnv(values: Readonly<Record<string, string | undefined>>): void {
  for (const key of wechatEnvKeys()) {
    const value = values[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

function wechatEnvKeys(): readonly string[] {
  return ["WECHAT_MINIAPP_APP_ID", "WECHAT_PAY_MCH_ID", "WECHAT_PAY_SERIAL_NO", "WECHAT_PAY_PRIVATE_KEY_PATH", "WECHAT_PAY_PUBLIC_KEY_ID", "WECHAT_PAY_PUBLIC_KEY_PATH", "WECHAT_PAY_API_V3_KEY", "WECHAT_PAY_NOTIFY_URL", "WECHAT_PAY_REFUND_NOTIFY_URL", "WECHAT_PAY_ENABLED", "WECHAT_PAY_MERCHANT_MODE", "WECHAT_PAY_TEST_PRIVATE_KEY"]
}
