// allow: SIZE_OK — Todo14 requires one DB e2e file covering money, WeChat callbacks, reconciliation, and notifications.
import { createCipheriv, createHash, generateKeyPairSync, sign } from "node:crypto"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { createServer, type Server } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { INestApplication } from "@nestjs/common"
import { Test, type TestingModule } from "@nestjs/testing"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { AppModule } from "../src/app.module.js"
import { hashToken, STAFF_SESSION_COOKIE } from "../src/modules/iam/staff-session-token.js"
import { merchantNumber } from "../src/modules/wechat/wechat-crypto.js"
import { WechatPayClient } from "../src/modules/wechat/wechat-pay.client.js"
import { WechatPaymentService } from "../src/modules/wechat/wechat-payment.service.js"
import {
  closeCatalogTripDatabase,
  createScope,
  dataSource,
  databaseUrl,
  DEV_ADMIN_HEADERS,
  initializeCatalogTripDatabase,
} from "./catalog-trip-fixture.js"
import { type CatalogFixture, createCatalog, createMember, enrollmentBody, familyHeader, restoreNodeEnv, studentIdentityMemberBody, virtualPhone, virtualResidentId } from "./enrollment-consent-fixture.js"
import { createOrder, mockEventBody, resetMockPaymentData, startMockPayment } from "./mock-payment-fixture.js"

const ORIGIN = "http://127.0.0.1:5173"
const API_V3_KEY = "01234567890123456789012345678901"
const WECHAT_APP_ID = "todo14-app"
const WECHAT_MCH_ID = "todo14-mch"
const BILL_DATE = "2026-09-23"
let scope = ""
let identitySequence = 100

type PaidOrder = { readonly id: string; readonly amountFen: number; readonly headers: Record<string, string>; readonly tourSessionId: string }
type LineRow = { readonly id: string; readonly enrollmentParticipantId: string }
type StatusRow = { readonly status: string; readonly abnormalReason?: string | null }
type SubscribeReply = { readonly kind: "json"; readonly errcode: number; readonly errmsg: string } | { readonly kind: "timeout" }
type SubscribeFixture = { readonly origin: string; readonly replies: SubscribeReply[]; readonly received: string[]; readonly close: () => Promise<void> }

describe.skipIf(databaseUrl === undefined)("Remaining money and notifications DB journey", () => {
  let app: INestApplication | null = null
  let previousNodeEnv: string | undefined
  let previousOrigin: string | undefined
  let previousWechat: Readonly<Record<string, string | undefined>>
  let keyDir: string | null = null
  let subscribe: SubscribeFixture | null = null

  beforeAll(initializeCatalogTripDatabase)

  beforeEach(async () => {
    scope = createScope().replace("catalog-trip-", "todo14-")
    identitySequence = 100
    process.stdout.write(`[todo14-scope:money-notifications] ${scope}\n`)
    previousNodeEnv = process.env["NODE_ENV"]
    previousOrigin = process.env["ADMIN_WEB_ORIGIN"]
    previousWechat = captureWechatEnv()
    process.env["NODE_ENV"] = "development"
    process.env["ADMIN_WEB_ORIGIN"] = ORIGIN
    keyDir = installWechatFixtureKeys()
    subscribe = await createSubscribeFixture()
    process.env["WECHAT_SUBSCRIBE_ENABLED"] = "true"
    process.env["WECHAT_SUBSCRIBE_ACCESS_TOKEN"] = `token-${scope}`
    process.env["WECHAT_SUBSCRIBE_API_ORIGIN"] = subscribe.origin
    app = await createTodo14App(billText())
  })

  afterEach(async () => {
    try {
      if (app !== null) await app.close()
      await cleanup(scope)
    } finally {
      await subscribe?.close()
      if (keyDir !== null) rmSync(keyDir, { recursive: true, force: true })
      restoreNodeEnv(previousNodeEnv)
      restoreOrigin(previousOrigin)
      restoreWechatEnv(previousWechat)
      app = null
      subscribe = null
      keyDir = null
    }
  })

  afterAll(closeCatalogTripDatabase)

  it("runs family refund application through review split, local execution, roster cancellation, capacity recovery, and stale transport version", async () => {
    // Given
    const target = requireApp(app)
    const catalog = await capacityCatalog(target, 2)
    const order = await paidOrder(target, catalog, "refund", 2)
    const lines = await orderLines(order.id)
    const reviewer = await staffSession(`${scope}-reviewer`, ["refunds.review"])
    const executor = await staffSession(`${scope}-executor`, ["refunds.execute"])
    const beforeAvailability = await availability(target, catalog).expect(400)
    await saveTransportPlan(target, catalog)
    const confirmed = await confirmCurrentTransport(target, catalog)

    // When
    const application = await request(target.getHttpServer()).post(`/orders/${order.id}/refund-applications`).set(order.headers)
      .send({ lineIds: [lines[0]?.id], reason: "parent schedule conflict", idempotencyKey: `${scope}-application` }).expect(201)
    await request(target.getHttpServer()).post(`/staff/refund-applications/${application.body.id}/review`).set(reviewer).set("Origin", ORIGIN)
      .send({ decision: "approved", reason: "approved by reviewer" }).expect(201)
    await request(target.getHttpServer()).post(`/staff/refund-applications/${application.body.id}/execute`).set(reviewer).set("Origin", ORIGIN)
      .send({ outcome: "succeeded" }).expect(403)
    await request(target.getHttpServer()).post(`/staff/refund-applications/${application.body.id}/execute`).set(executor).set("Origin", ORIGIN)
      .send({ outcome: "succeeded" }).expect(201)

    // Then
    const detail = await request(target.getHttpServer()).get(`/orders/${order.id}/detail`).set(order.headers).expect(200)
    expect(application.body).toMatchObject({ status: "submitted", amountFen: 1200 })
    expect(detail.body.refundSummary).toMatchObject({ status: "partial", refundedFen: 1200 })
    expect(detail.body.participants.filter((person: { readonly refundStatus: string }) => person.refundStatus === "refunded")).toHaveLength(1)
    await expect(dataSource.query("select status from roster_entries where enrollment_participant_id = ?", [lines[0]?.enrollmentParticipantId])).resolves.toEqual([{ status: "cancelled" }])
    const afterAvailability = await availability(target, catalog).expect(200)
    expect(beforeAvailability.body).toMatchObject({ code: "stale_state", remainingCapacity: 0 })
    expect(afterAvailability.body).toMatchObject({ remainingCapacity: 1 })
    const stale = await request(target.getHttpServer()).get(`/transport/sessions/${catalog.tourSessionId}/people-plan`).set(DEV_ADMIN_HEADERS).expect(200)
    expect(confirmed.confirmation.status).toBe("current")
    expect(stale.body.confirmation).toMatchObject({ status: "stale" })
  })

  it("processes signed WeChat refund callbacks idempotently and preserves pending state for processing, unknown, and mismatches", async () => {
    // Given
    const target = requireApp(app)
    const payment = await wechatRefundFixture(target, "callback")
    const service = target.get(WechatPaymentService)

    // When
    const processingEvent = signedRefundNotification("event-processing", payment.outRefundNo, "PROCESSING", 1200, 2400, "CNY")
    await service.handleRefundCallback(processingEvent.headers, processingEvent.body)
    const processing = await refundStatus(payment.refundRequestId, payment.outRefundNo)
    const successEvent = signedRefundNotification("event-success", payment.outRefundNo, "SUCCESS", 1200, 2400, "CNY")
    await service.handleRefundCallback(successEvent.headers, successEvent.body)
    await service.handleRefundCallback(successEvent.headers, successEvent.body)
    const success = await refundStatus(payment.refundRequestId, payment.outRefundNo)
    const unknown = await wechatRefundFixture(target, "unknown")
    const unknownEvent = signedRefundNotification("event-unknown", unknown.outRefundNo, "USERPAYING", 1200, 2400, "CNY")
    await service.handleRefundCallback(unknownEvent.headers, unknownEvent.body)
    const mismatch = await wechatRefundFixture(target, "mismatch")
    const mismatchEvent = signedRefundNotification("event-mismatch", mismatch.outRefundNo, "SUCCESS", 1300, 2400, "CNY")
    await service.handleRefundCallback(mismatchEvent.headers, mismatchEvent.body)
    const currency = await wechatRefundFixture(target, "currency")
    const currencyEvent = signedRefundNotification("event-currency", currency.outRefundNo, "SUCCESS", 1200, 2400, "USD")
    await expect(service.handleRefundCallback(currencyEvent.headers, currencyEvent.body)).rejects.toMatchObject({ response: expect.objectContaining({ code: "wechat_currency_mismatch" }) })

    // Then
    expect(processing).toMatchObject({ requestStatus: "pending", transactionStatus: "processing" })
    expect(success).toMatchObject({ requestStatus: "succeeded", transactionStatus: "succeeded" })
    await expect(refundStatus(unknown.refundRequestId, unknown.outRefundNo)).resolves.toMatchObject({ requestStatus: "pending", transactionStatus: "unknown" })
    await expect(refundStatus(mismatch.refundRequestId, mismatch.outRefundNo)).resolves.toMatchObject({ requestStatus: "pending", transactionStatus: "abnormal", abnormalReason: "refund_amount_mismatch" })
    await expect(refundStatus(currency.refundRequestId, currency.outRefundNo)).resolves.toMatchObject({ requestStatus: "pending", transactionStatus: "processing" })
    await expect(dataSource.query("select count(*) as count from refund_requests where id = ?", [payment.refundRequestId])).resolves.toEqual([{ count: "1" }])
  })

  it("persists WeChat bill payment and refund differences without mutating ledger rows", async () => {
    // Given
    const target = requireApp(app)
    const fixture = await wechatRefundFixture(target, "bill")
    const before = await ledgerSnapshot(fixture)

    // When
    const reconciled = await request(target.getHttpServer()).post("/staff/payments/reconciliation").set(DEV_ADMIN_HEADERS).set("Origin", ORIGIN)
      .send({ date: BILL_DATE }).expect(201)
    const readBack = await request(target.getHttpServer()).get(`/staff/payments/reconciliation/${BILL_DATE}`).set(DEV_ADMIN_HEADERS).expect(200)

    // Then
    expect(reconciled.body.differences.map((row: { readonly kind: string }) => row.kind).sort()).toEqual(["amount_mismatch", "refund_mismatch", "wechat_only"])
    expect(readBack.body).toMatchObject({ billDate: BILL_DATE, differenceCount: 3 })
    await expect(ledgerSnapshot(fixture)).resolves.toEqual(before)
  })

  it("records notification authorization, preview, task delivery ledger, retryable outcomes, withdrawal, and family isolation", async () => {
    // Given
    const target = requireApp(app)
    const api = requireSubscribe(subscribe)
    const catalog = await capacityCatalog(target, 8)
    const staff = await staffSession(`${scope}-notify`, ["notifications.read", "notifications.write", "notifications.send"])
    const orders = await Promise.all(["accepted", "refused", "quota", "timeout"].map((family) => paidOrder(target, catalog, family, 1)))
    const authorizations = []
    for (const order of orders) authorizations.push(await seedVerifiedNotificationRecipient(target, order, order.id))
    api.replies.push(
      { kind: "json", errcode: 0, errmsg: "ok" },
      { kind: "json", errcode: 43101, errmsg: "user refuse to accept the msg" },
      { kind: "json", errcode: 45009, errmsg: "reach max api daily quota limit" },
      { kind: "timeout" },
    )
    const content = await createNotificationContent(target, catalog, staff, "delivery")
    const preview = await request(target.getHttpServer()).post(`/staff/notifications/sessions/${catalog.tourSessionId}/preview`).set(staff).set("Origin", ORIGIN)
      .send({ authorizationIds: authorizations.map((item) => item.id) }).expect(201)
    const task = await request(target.getHttpServer()).post(`/staff/notifications/sessions/${catalog.tourSessionId}/tasks`).set(staff).set("Origin", ORIGIN)
      .send({ contentVersionId: content.id, authorizationIds: authorizations.map((item) => item.id), idempotencyKey: `${scope}-notify-task` }).expect(201)

    // When
    const delivered = await request(target.getHttpServer()).post(`/staff/notifications/tasks/${task.body.id}/send`).set(staff).set("Origin", ORIGIN).expect(201)
    const withdrawnOrder = await paidOrder(target, catalog, "withdrawn", 1)
    const withdrawn = await seedVerifiedNotificationRecipient(target, withdrawnOrder, "withdrawn")
    const blockedTask = await request(target.getHttpServer()).post(`/staff/notifications/sessions/${catalog.tourSessionId}/tasks`).set(staff).set("Origin", ORIGIN)
      .send({ contentVersionId: content.id, authorizationIds: [withdrawn.id], idempotencyKey: `${scope}-withdraw-task` }).expect(201)
    await request(target.getHttpServer()).post(`/orders/${withdrawnOrder.id}/notification-recipients/${withdrawn.id}/withdraw`).set(withdrawnOrder.headers)
      .send({ expectedVersion: withdrawn.version }).expect(201)
    const blocked = await request(target.getHttpServer()).post(`/staff/notifications/tasks/${blockedTask.body.id}/send`).set(staff).set("Origin", ORIGIN).expect(201)
    const other = await paidOrder(target, catalog, "isolated", 1)
    await request(target.getHttpServer()).post(`/orders/${orders[0]?.id}/notification-recipients`).set(other.headers)
      .send({ receiverName: "Other Parent", relation: "guardian", channel: "manual", idempotencyKey: `${scope}-cross` }).expect(403)

    // Then
    expect(preview.body).toHaveLength(4)
    expect(delivered.body.attempts.map((attempt: { readonly status: string; readonly errorCode: string | null }) => [attempt.status, attempt.errorCode])).toEqual(expect.arrayContaining([
      ["api_accepted", null], ["undelivered", "43101"], ["retryable_failed", "45009"], ["manual_required", "wechat_transport_unknown"],
    ]))
    expect(blocked.body.attempts).toContainEqual(expect.objectContaining({ status: "manual_required", errorCode: "authorization_withdrawn" }))
    expect(api.received).toHaveLength(4)
    await expect(dataSource.query("select count(*) as count from notification_delivery_attempts where task_id in (?, ?)", [task.body.id, blockedTask.body.id])).resolves.toEqual([{ count: "5" }])
  })
})

async function createTodo14App(bill: string): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(WechatPayClient)
    .useValue({ downloadBill: async () => ({ content: Buffer.from(bill), hashType: "SHA256", hash: createHash("sha256").update(bill).digest("hex") }) })
    .compile()
  const created = moduleFixture.createNestApplication()
  await created.init()
  return created
}

function requireApp(value: INestApplication | null): INestApplication {
  if (value === null) throw new Error("test app was not initialized")
  return value
}

async function capacityCatalog(target: INestApplication, capacity: number, catalogScope = scope): Promise<CatalogFixture> {
  const catalog = await createCatalog(target, catalogScope)
  await dataSource.query("update tour_sessions set capacity = ?, price_fen = 1200 where id = ?", [capacity, catalog.tourSessionId])
  return catalog
}

async function paidOrder(target: INestApplication, catalog: CatalogFixture, family: string, count: number): Promise<PaidOrder> {
  const headers = familyHeader(scope, family)
  const memberIds = []
  for (let index = 0; index < count; index += 1) {
    const displayName = `Todo14 ${family} ${index}`
    const code = `member-${scope}-${family}-${index}`
    const identity = { participantKind: "student" as const, identityNumber: virtualResidentId("20100101", String(identitySequence).padStart(3, "0")), phone: virtualPhone(String(identitySequence)) }
    identitySequence += 1
    const member = await createMember({ app: target, scope, headers, catalog, displayName, codeSuffix: `${family}-${index}`, body: studentIdentityMemberBody(catalog, displayName, code, identity) })
    memberIds.push(member.id)
  }
  const enrollment = await request(target.getHttpServer()).post("/enrollments").set(headers).send(enrollmentBody({
    catalog, memberIds, contactName: `Parent ${family}`, emergencyContactName: "Emergency", emergencyContactPhone: virtualPhone("1014"),
  })).expect(201)
  const fixture = { headers, enrollmentId: enrollment.body.id, tourSessionId: catalog.tourSessionId, participantIds: [] }
  const order = await createOrder(target, fixture, `${scope}-${family}`)
  await startMockPayment(target, fixture, order.id)
  await request(target.getHttpServer()).post("/payments/mock/events").set(headers).send(mockEventBody({
    eventId: `${order.id}-paid`, orderId: order.id, transactionId: `${order.id}-tx`, amountFen: order.amountFen, status: "succeeded",
  })).expect(201)
  return { ...order, headers, tourSessionId: catalog.tourSessionId }
}

async function orderLines(orderId: string): Promise<readonly LineRow[]> {
  return dataSource.query("select id, enrollment_participant_id as enrollmentParticipantId from order_lines where order_id = ? order by id", [orderId])
}

async function ensureStaffAccount(id: string): Promise<void> {
  await dataSource.query(
    "insert into staff_accounts (id, username, display_name, password_hash, status, force_password_change, failed_login_attempts, permissions_version, created_at, updated_at) values (?, ?, ?, 'test-hash', 'active', false, 0, 1, current_timestamp(6), current_timestamp(6)) on duplicate key update status = 'active', updated_at = current_timestamp(6)",
    [id, id, id],
  )
}

async function staffSession(id: string, permissions: readonly string[]): Promise<Record<string, string>> {
  const token = `token-${id}`
  await dataSource.query("insert into staff_accounts (id, username, display_name, password_hash, status, force_password_change, failed_login_attempts, permissions_version, created_at, updated_at) values (?, ?, ?, 'test-hash', 'active', false, 0, 1, current_timestamp(6), current_timestamp(6))", [id, id, id])
  for (const permission of permissions) {
    await dataSource.query("insert into staff_account_permissions (id, staff_account_id, permission_key, created_at) values (?, ?, ?, current_timestamp(6))", [`${id}-${permission}`, id, permission])
  }
  await dataSource.query("insert into staff_account_scopes (id, staff_account_id, scope_kind, scope_id, created_at) values (?, ?, 'all', null, current_timestamp(6))", [`${id}-all`, id])
  await dataSource.query("insert into staff_sessions (id, staff_account_id, token_hash, permissions_version, expires_at, revoked_at, created_at) values (?, ?, ?, 1, date_add(current_timestamp(6), interval 1 day), null, current_timestamp(6))", [`session-${id}`, id, hashToken(token)])
  return { Cookie: `${STAFF_SESSION_COOKIE}=${encodeURIComponent(token)}` }
}

function availability(target: INestApplication, catalog: CatalogFixture) {
  return request(target.getHttpServer()).get(`/tour-sessions/${catalog.tourSessionId}/enrollment-availability`).query({ at: "2026-09-22T00:00:00.000Z" })
}

async function saveTransportPlan(target: INestApplication, catalog: CatalogFixture): Promise<void> {
  await request(target.getHttpServer()).put(`/transport/sessions/${catalog.tourSessionId}/plan`).set(DEV_ADMIN_HEADERS).set("Origin", ORIGIN).send({
    vehicles: [{ sequence: 1, seatCapacity: 2, plateNumber: "", contactSnapshot: emptyContact(), allocations: [{ classId: catalog.classId, studentCount: 2, guardianCount: 0, teacherCount: 0, otherCount: 0, note: "" }] }],
  }).expect(200)
}

async function confirmCurrentTransport(target: INestApplication, catalog: CatalogFixture) {
  const people = await request(target.getHttpServer()).get(`/transport/sessions/${catalog.tourSessionId}/people-plan`).set(DEV_ADMIN_HEADERS).expect(200)
  const confirmed = await request(target.getHttpServer()).post(`/transport/sessions/${catalog.tourSessionId}/confirmations`).set(DEV_ADMIN_HEADERS).set("Origin", ORIGIN)
    .send({ expectedPlanVersion: people.body.planVersion, expectedRosterVersion: people.body.rosterVersion }).expect(201)
  return confirmed.body
}

function emptyContact() {
  return { driverName: "", driverPhone: "", guideName: "", guidePhone: "", teacherName: "", teacherPhone: "" }
}

async function wechatRefundFixture(target: INestApplication, name: string) {
  const catalog = await capacityCatalog(target, 10, `${scope}-${name}`)
  const order = await paidOrder(target, catalog, name, 2)
  const lines = await orderLines(order.id)
  const paymentNo = paymentNumber(name)
  const refundRequestId = `wx-refund-${scope}-${name}`
  const outRefundNo = merchantNumber("refund", refundRequestId)
  const requesterId = `${scope}-requester`
  await ensureStaffAccount(requesterId)
  await dataSource.query("insert into payments (id, organization_id, order_id, payment_no, provider_transaction_id, provider_event_id, status, amount_fen, channel, policy_version, created_at, updated_at) select ?, organization_id, id, ?, ?, ?, 'succeeded', amount_fen, 'wechat_pay', 'test', current_timestamp(6), current_timestamp(6) from orders where id = ?", [`payment-${scope}-${name}`, paymentNo, `wx-${scope}-${name}`, `wx-event-${scope}-${name}`, order.id])
  await dataSource.query("insert into refund_requests (id, organization_id, order_id, provider, idempotency_key, status, reason, note, amount_fen, requested_by_staff_id, processed_by_staff_id, failure_message, requested_at, processed_at, policy_version) select ?, organization_id, id, 'wechat_pay', ?, 'pending', 'wechat callback fixture', null, 1200, ?, null, null, current_timestamp(6), null, 'test' from orders where id = ?", [refundRequestId, `${scope}-${name}-refund`, requesterId, order.id])
  await dataSource.query("insert into refund_request_lines (id, organization_id, refund_request_id, order_line_id, amount_fen, policy_version) select ?, organization_id, ?, ?, 1200, 'test' from orders where id = ?", [`refund-line-${scope}-${name}`, refundRequestId, lines[0]?.id, order.id])
  await dataSource.query("insert into wechat_transactions (id, organization_id, kind, event_id, order_id, refund_request_id, out_trade_no, out_refund_no, provider_transaction_id, status, amount_fen, abnormal_reason, raw_payload, created_at, updated_at) select ?, organization_id, 'refund', ?, id, ?, ?, ?, null, 'processing', 1200, null, json_object(), current_timestamp(6), current_timestamp(6) from orders where id = ?", [`wechat-tx-${scope}-${name}`, `seed-${scope}-${name}`, refundRequestId, paymentNo, outRefundNo, order.id])
  return { refundRequestId, outRefundNo, paymentNo }
}

function signedRefundNotification(eventId: string, outRefundNo: string, status: string, refundFen: number, totalFen: number, currency: string) {
  const resource = { mchid: WECHAT_MCH_ID, out_refund_no: outRefundNo, refund_id: `wx-${eventId}`, refund_status: status, amount: { refund: refundFen, total: totalFen, currency } }
  return signedNotification(eventId, resource)
}

function signedNotification(eventId: string, resource: object) {
  const associatedData = "refund"
  const nonce = "abcdefghijkl"
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(API_V3_KEY), Buffer.from(nonce))
  cipher.setAAD(Buffer.from(associatedData))
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(resource)), cipher.final(), cipher.getAuthTag()])
  const body = JSON.stringify({ id: eventId, resource: { algorithm: "AEAD_AES_256_GCM", nonce, associated_data: associatedData, ciphertext: encrypted.toString("base64") } })
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = sign("RSA-SHA256", Buffer.from(`${timestamp}\nnonce\n${body}\n`), process.env["WECHAT_PAY_PRIVATE_KEY_PEM"] ?? "").toString("base64")
  return { body, headers: { "wechatpay-timestamp": timestamp, "wechatpay-nonce": "nonce", "wechatpay-serial": "platform-fixture", "wechatpay-signature": signature } }
}

async function refundStatus(refundRequestId: string, outRefundNo: string) {
  const requestRows: readonly StatusRow[] = await dataSource.query("select status from refund_requests where id = ?", [refundRequestId])
  const transactionRows: readonly StatusRow[] = await dataSource.query("select status, abnormal_reason as abnormalReason from wechat_transactions where out_refund_no = ?", [outRefundNo])
  return { requestStatus: requestRows[0]?.status, transactionStatus: transactionRows[0]?.status, abnormalReason: transactionRows[0]?.abnormalReason ?? null }
}

async function ledgerSnapshot(input: { readonly refundRequestId: string; readonly paymentNo: string }) {
  const payments = await dataSource.query("select payment_no as paymentNo, amount_fen as amountFen, status from payments where payment_no = ?", [input.paymentNo])
  const refunds = await dataSource.query("select id, amount_fen as amountFen, status from refund_requests where id = ?", [input.refundRequestId])
  return { payments, refunds }
}

function billText(): string {
  return [
    "交易时间,公众账号ID,商户号,微信订单号,商户订单号,交易状态,订单金额,退款金额,商户退款单号",
    `2026-09-23 10:00:00,${WECHAT_APP_ID},${WECHAT_MCH_ID},wx-amount,${paymentNumber("bill")},SUCCESS,13.00,0.00,`,
    `2026-09-23 10:01:00,${WECHAT_APP_ID},${WECHAT_MCH_ID},wx-only,wxonly-${scope.slice(-24)},SUCCESS,8.00,0.00,`,
    `2026-09-23 10:02:00,${WECHAT_APP_ID},${WECHAT_MCH_ID},wx-refund,${paymentNumber("bill")},REFUND,24.00,13.00,${merchantNumber("refund", `wx-refund-${scope}-bill`)}`,
    "总交易单数,总交易额,总退款金额",
    "3,45.00,13.00",
  ].join("\n")
}

function paymentNumber(name: string): string {
  return `wxpay-${createHash("sha256").update(`${scope}:${name}`).digest("hex").slice(0, 24)}`
}

async function seedVerifiedNotificationRecipient(target: INestApplication, order: PaidOrder, key: string) {
  const response = await request(target.getHttpServer()).post(`/orders/${order.id}/notification-recipients`).set(order.headers)
    .send({ receiverName: `Receiver ${key}`, relation: "guardian", channel: "manual", idempotencyKey: `${scope}-${key}-auth` }).expect(201)
  await dataSource.query("UPDATE notification_recipient_authorizations SET channel = 'wechat_subscribe', subscriber_openid = ? WHERE id = ?", [`verified-openid-${key}`, response.body.id])
  return { id: response.body.id, version: response.body.version }
}

async function createNotificationContent(target: INestApplication, catalog: CatalogFixture, headers: Record<string, string>, key: string) {
  const response = await request(target.getHttpServer()).post(`/staff/notifications/sessions/${catalog.tourSessionId}/content-versions`).set(headers).set("Origin", ORIGIN)
    .send({ title: "集合提醒", bodyText: "请查看集合信息", templateId: `template-${key}`, miniappPage: "pages/orders/detail", templateData: { thing1: { value: "集合提醒" } } }).expect(201)
  return { id: response.body.id }
}

function requireSubscribe(value: SubscribeFixture | null): SubscribeFixture {
  if (value === null) throw new Error("subscribe fixture missing")
  return value
}

function createSubscribeFixture(): Promise<SubscribeFixture> {
  const replies: SubscribeReply[] = []
  const received: string[] = []
  const server = createServer((message, response) => {
    const chunks: Buffer[] = []
    message.on("data", (chunk: Buffer) => chunks.push(chunk))
    message.on("end", () => {
      received.push(Buffer.concat(chunks).toString("utf8"))
      const reply = replies.shift() ?? { kind: "json", errcode: 0, errmsg: "ok" }
      if (reply.kind === "timeout") return
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({ errcode: reply.errcode, errmsg: reply.errmsg }))
    })
  })
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ origin: `http://127.0.0.1:${addressPort(server)}`, replies, received, close: () => closeServer(server) }))
  })
}

function addressPort(server: Server): number {
  const address = server.address()
  if (typeof address === "object" && address !== null) return address.port
  throw new Error("server address missing")
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)))
}

function installWechatFixtureKeys(): string {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 })
  const privateKey = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString()
  const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString()
  const dir = mkdtempSync(join(tmpdir(), "linan-todo14-"))
  writeFileSync(join(dir, "private.pem"), privateKey)
  writeFileSync(join(dir, "public.pem"), publicKey)
  process.env["WECHAT_PAY_PRIVATE_KEY_PEM"] = privateKey
  process.env["WECHAT_PAY_ENABLED"] = "true"
  process.env["WECHAT_PAY_MERCHANT_MODE"] = "direct_confirmed"
  process.env["WECHAT_MINIAPP_APP_ID"] = WECHAT_APP_ID
  process.env["WECHAT_PAY_MCH_ID"] = WECHAT_MCH_ID
  process.env["WECHAT_PAY_SERIAL_NO"] = "merchant-fixture"
  process.env["WECHAT_PAY_PUBLIC_KEY_ID"] = "platform-fixture"
  process.env["WECHAT_PAY_PRIVATE_KEY_PATH"] = join(dir, "private.pem")
  process.env["WECHAT_PAY_PUBLIC_KEY_PATH"] = join(dir, "public.pem")
  process.env["WECHAT_PAY_API_V3_KEY"] = API_V3_KEY
  process.env["WECHAT_PAY_NOTIFY_URL"] = "https://example.test/wechat/pay"
  process.env["WECHAT_PAY_REFUND_NOTIFY_URL"] = "https://example.test/wechat/refund"
  return dir
}

function captureWechatEnv(): Readonly<Record<string, string | undefined>> {
  return Object.fromEntries(wechatEnvKeys().map((key) => [key, process.env[key]]))
}

function restoreWechatEnv(values: Readonly<Record<string, string | undefined>>): void {
  for (const key of wechatEnvKeys()) {
    const value = values[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

function wechatEnvKeys(): readonly string[] {
  return [
    "WECHAT_PAY_PRIVATE_KEY_PEM",
    "WECHAT_PAY_ENABLED",
    "WECHAT_PAY_MERCHANT_MODE",
    "WECHAT_MINIAPP_APP_ID",
    "WECHAT_PAY_MCH_ID",
    "WECHAT_PAY_SERIAL_NO",
    "WECHAT_PAY_PUBLIC_KEY_ID",
    "WECHAT_PAY_PRIVATE_KEY_PATH",
    "WECHAT_PAY_PUBLIC_KEY_PATH",
    "WECHAT_PAY_API_V3_KEY",
    "WECHAT_PAY_NOTIFY_URL",
    "WECHAT_PAY_REFUND_NOTIFY_URL",
    "WECHAT_SUBSCRIBE_ENABLED",
    "WECHAT_SUBSCRIBE_ACCESS_TOKEN",
    "WECHAT_SUBSCRIBE_API_ORIGIN",
  ]
}

function restoreOrigin(value: string | undefined): void {
  if (value === undefined) delete process.env["ADMIN_WEB_ORIGIN"]
  else process.env["ADMIN_WEB_ORIGIN"] = value
}

async function cleanup(activeScope: string): Promise<void> {
  if (activeScope.length === 0) return
  await dataSource.query("delete a from notification_delivery_attempts a join notification_delivery_tasks t on t.id = a.task_id where t.idempotency_key like ?", [`${activeScope}%`])
  await dataSource.query("delete target from notification_delivery_targets target join notification_delivery_tasks task on task.id = target.task_id where task.idempotency_key like ?", [`${activeScope}%`])
  await dataSource.query("delete from notification_delivery_tasks where idempotency_key like ?", [`${activeScope}%`])
  await dataSource.query("delete c from notification_content_versions c join tour_sessions ts on ts.id = c.tour_session_id where ts.code like ?", [`session-${activeScope}%`])
  await dataSource.query("delete a from notification_recipient_authorizations a join orders o on o.id = a.order_id join enrollments e on e.id = o.enrollment_id join families f on f.id = e.family_id where f.code like ?", [`family-${activeScope}%`])
  await dataSource.query("delete entry from notification_channel_entries entry join tour_sessions ts on ts.id = entry.tour_session_id where ts.code like ?", [`session-${activeScope}%`])
  await dataSource.query("delete d from wechat_bill_differences d join wechat_bill_reconciliations r on r.id = d.reconciliation_id where r.bill_date = ?", [BILL_DATE])
  await dataSource.query("delete from wechat_bill_reconciliations where bill_date = ?", [BILL_DATE])
  await dataSource.query("delete from wechat_transactions where out_trade_no like ? or id like ?", [`wechat-payment-${activeScope}%`, `wechat-tx-${activeScope}%`])
  await dataSource.query("delete line from refund_request_lines line join refund_requests request on request.id = line.refund_request_id where request.id like ?", [`%${activeScope}%`])
  await dataSource.query("delete from refund_applications where idempotency_key like ? or idempotency_key like ?", [`${activeScope}%`, `%${activeScope}%`])
  await dataSource.query("delete from refund_requests where id like ? or idempotency_key like ?", [`%${activeScope}%`, `%${activeScope}%`])
  await dataSource.query("delete line from refund_request_lines line join refund_requests request on request.id = line.refund_request_id join orders o on o.id = request.order_id join enrollments e on e.id = o.enrollment_id join families f on f.id = e.family_id where f.code like ?", [`family-${activeScope}%`])
  await dataSource.query("delete request from refund_requests request join orders o on o.id = request.order_id join enrollments e on e.id = o.enrollment_id join families f on f.id = e.family_id where f.code like ?", [`family-${activeScope}%`])
  await dataSource.query("update transport_plans p join tour_sessions ts on ts.id = p.tour_session_id set p.current_confirmation_id = null where ts.code like ?", [`session-${activeScope}%`])
  await dataSource.query("delete c from transport_confirmations c join tour_sessions ts on ts.id = c.tour_session_id where ts.code like ?", [`session-${activeScope}%`])
  await dataSource.query("delete p from transport_person_allocations p join tour_sessions ts on ts.id = p.tour_session_id where ts.code like ?", [`session-${activeScope}%`])
  await dataSource.query("delete p from transport_plans p join tour_sessions ts on ts.id = p.tour_session_id where ts.code like ?", [`session-${activeScope}%`])
  await dataSource.query("delete a from transport_class_allocations a join transport_session_vehicles v on v.id = a.vehicle_id join tour_sessions ts on ts.id = v.tour_session_id where ts.code like ?", [`session-${activeScope}%`])
  await dataSource.query("delete v from transport_session_vehicles v join tour_sessions ts on ts.id = v.tour_session_id where ts.code like ?", [`session-${activeScope}%`])
  await resetMockPaymentData(activeScope)
  await dataSource.query("delete from staff_sessions where staff_account_id like ?", [`${activeScope}-%`])
  await dataSource.query("delete from staff_account_permissions where staff_account_id like ?", [`${activeScope}-%`])
  await dataSource.query("delete from staff_account_scopes where staff_account_id like ?", [`${activeScope}-%`])
  await dataSource.query("delete from staff_accounts where id like ?", [`${activeScope}-%`])
}
