// allow: SIZE_OK — persisted staff refund DB E2E keeps setup, production gates, idempotency, and settlement assertions in one scenario fixture.
import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { hashToken } from "../src/modules/iam/staff-session-token.js"
import {
  closeCatalogTripDatabase, createCatalogTripApp, createScope, dataSource,
  databaseUrl, initializeCatalogTripDatabase,
} from "./catalog-trip-fixture.js"
import {
  createCatalog, createMember, enrollmentBody, familyHeader, restoreNodeEnv, virtualPhone, type CatalogFixture,
} from "./enrollment-consent-fixture.js"
import {
  createOrder, mockEventBody, resetMockPaymentData, startMockPayment,
} from "./mock-payment-fixture.js"

type PaidRefundFixture = {
  readonly familyHeaders: Record<string, string>
  readonly staffHeaders: Record<string, string>
  readonly financeHeaders: Record<string, string>
  readonly orderId: string
  readonly amountFen: number
  readonly lineIds: readonly string[]
}

describe.skipIf(databaseUrl === undefined)("Staff persisted local refunds", () => {
  let app: INestApplication
  let scope: string
  let staffHeaders: Record<string, string>
  let financeHeaders: Record<string, string>
  let catalog: CatalogFixture | undefined
  let fixtureIndex: number

  beforeAll(initializeCatalogTripDatabase)
  beforeEach(async () => {
    scope = createScope()
    catalog = undefined
    fixtureIndex = 0
    app = await createCatalogTripApp()
    staffHeaders = await createStaffAccount(`${scope}-admin`, ["orders.read", "refunds.preview", "refunds.simulate", "refunds.manage"])
    financeHeaders = await createStaffAccount(`${scope}-finance`, ["orders.read"])
  })
  afterEach(async () => {
    await cleanupRefundData(scope)
    await app.close()
    await resetMockPaymentData(scope)
    await cleanupStaffData(scope)
  })
  afterAll(closeCatalogTripDatabase)

  it("persists and succeeds a one-person local refund without fully refunding the order", async () => {
    // Given
    const fixture = await paidFixture("partial")
    const firstLineId = firstLineIdOf(fixture)

    // When
    const created = await createRefund(fixture, [firstLineId], `${scope}-partial-key`)
    const processed = await processRefund(fixture.orderId, created.body.id, "succeeded")

    // Then
    expect(created.body).toEqual(expect.objectContaining({
      orderId: fixture.orderId, status: "pending", amountFen: 12800, reason: "parent cancellation",
    }))
    expect(processed.body).toEqual(expect.objectContaining({ id: created.body.id, status: "succeeded", amountFen: 12800 }))
    await expect(dataSource.query("select status from orders where id = ?", [fixture.orderId])).resolves.toEqual([{ status: "paid" }])
    await expect(dataSource.query("select status from payments where order_id = ?", [fixture.orderId])).resolves.toEqual([{ status: "succeeded" }])
    await expect(dataSource.query(
      "select r.status from roster_entries r join order_lines ol on ol.enrollment_participant_id = r.enrollment_participant_id where ol.id = ?",
      [firstLineId],
    )).resolves.toEqual([{ status: "cancelled" }])
    const familyDetail = await request(app.getHttpServer()).get(`/orders/${fixture.orderId}/detail`).set(fixture.familyHeaders).expect(200)
    expect(familyDetail.body.refundSummary).toEqual(expect.objectContaining({ status: "partial", refundedFen: 12800 }))
    expect(familyDetail.body.participants[0]).toEqual(expect.objectContaining({ refundStatus: "refunded", refundedFen: 12800 }))
  })

  it("replays the same idempotency key for the same order and rejects it across another order", async () => {
    // Given
    const first = await paidFixture("replay-a")
    const second = await paidFixture("replay-b")
    const body = refundBody([firstLineIdOf(first)], `${scope}-same-key`)

    // When
    const created = await request(app.getHttpServer()).post(`/staff/orders/${first.orderId}/refunds`).set(staffHeaders).send(body).expect(201)
    const replay = await request(app.getHttpServer()).post(`/staff/orders/${first.orderId}/refunds`).set(staffHeaders).send(body).expect(201)
    const conflict = await request(app.getHttpServer()).post(`/staff/orders/${second.orderId}/refunds`).set(staffHeaders).send({
      ...body,
      lineIds: [firstLineIdOf(second)],
    }).expect(409)

    // Then
    expect(replay.body.id).toBe(created.body.id)
    expect(conflict.body.code).toBe("idempotency_conflict")
  })

  it("rejects a new idempotency key while the same person already has a pending refund", async () => {
    // Given
    const fixture = await paidFixture("duplicate-person")
    await createRefund(fixture, [firstLineIdOf(fixture)], `${scope}-first-key`)

    // When
    const conflict = await request(app.getHttpServer()).post(`/staff/orders/${fixture.orderId}/refunds`)
      .set(staffHeaders)
      .send(refundBody([firstLineIdOf(fixture)], `${scope}-second-key`))
      .expect(409)

    // Then
    expect(conflict.body.code).toBe("refund_line_already_refunded")
  })

  it("keeps failed refunds retryable with a new key", async () => {
    // Given
    const fixture = await paidFixture("failed-retry")
    const failed = await createRefund(fixture, [firstLineIdOf(fixture)], `${scope}-failed-key`)
    await processRefund(fixture.orderId, failed.body.id, "failed")

    // When
    const retried = await createRefund(fixture, [firstLineIdOf(fixture)], `${scope}-retry-key`)

    // Then
    expect(retried.body).toEqual(expect.objectContaining({ status: "pending", amountFen: 12800 }))
  })

  it.each([
    { status: "pending", audience: "family" },
    { status: "succeeded", audience: "family" },
    { status: "pending", audience: "staff" },
    { status: "succeeded", audience: "staff" },
  ] as const)("previews remaining balances without writes when a $status refund exists for $audience", async ({ status, audience }) => {
    // Given
    const fixture = await paidFixture(`preview-${status}-${audience}`)
    const refund = await createRefund(fixture, [firstLineIdOf(fixture)], `${scope}-preview-key`)
    if (status === "succeeded") await processRefund(fixture.orderId, refund.body.id, status)
    const before = await refundSnapshot(fixture.orderId)
    const prefix = audience === "staff" ? "/staff/orders" : "/orders"
    const headers = audience === "staff" ? staffHeaders : fixture.familyHeaders

    // When
    const response = await request(app.getHttpServer()).post(`${prefix}/${fixture.orderId}/refund-preview`)
      .set(headers).send({ lineIds: fixture.lineIds }).expect(201)

    // Then
    expect(response.body.amountFen).toBe(12800)
    expect(response.body.lines).toEqual([
      expect.objectContaining({ lineId: firstLineIdOf(fixture), amountFen: 0 }),
      expect.objectContaining({ lineId: fixture.lineIds[1], amountFen: 12800 }),
    ])
    expect(response.body.settlementPerformed).toBe(false)
    expect(await refundSnapshot(fixture.orderId)).toEqual(before)
  })

  it("keeps internal refund notes and failure details within staff responses", async () => {
    // Given
    const fixture = await paidFixture("internal-history")
    const refund = await createRefund(fixture, [firstLineIdOf(fixture)], `${scope}-internal-key`)
    await processRefund(fixture.orderId, refund.body.id, "failed")

    // When
    const family = await request(app.getHttpServer()).get(`/orders/${fixture.orderId}/detail`).set(fixture.familyHeaders).expect(200)
    const staff = await request(app.getHttpServer()).get(`/staff/orders/${fixture.orderId}`).set(staffHeaders).expect(200)

    // Then
    expect(family.body.refundHistory[0]).not.toHaveProperty("note")
    expect(family.body.refundHistory[0]).not.toHaveProperty("failureMessage")
    expect(staff.body.refundHistory[0]).toEqual(expect.objectContaining({
      note: "called front desk", failureMessage: "local provider rejected",
    }))
  })

  it("persists one refund and one success audit when creation and processing are double-clicked", async () => {
    // Given
    const fixture = await paidFixture("double-click")

    // When
    const [first, second] = await Promise.all([
      createRefund(fixture, [firstLineIdOf(fixture)], `${scope}-double-key`),
      createRefund(fixture, [firstLineIdOf(fixture)], `${scope}-double-key`),
    ])
    const results = await Promise.all([
      processRefund(fixture.orderId, first.body.id, "succeeded"),
      processRefund(fixture.orderId, second.body.id, "succeeded"),
    ])

    // Then
    expect(second.body.id).toBe(first.body.id)
    expect(results.map((result) => result.body.status)).toEqual(["succeeded", "succeeded"])
    await expect(dataSource.query("select status, amount_fen from refund_requests where order_id = ?", [fixture.orderId]))
      .resolves.toEqual([{ status: "succeeded", amount_fen: 12800 }])
    await expect(dataSource.query("select action from audit_logs where target_id = ? order by action", [first.body.id]))
      .resolves.toEqual([{ action: "refund.create" }, { action: "refund.succeed" }])
  })

  it("allows only one concurrent request with distinct keys for the same participant", async () => {
    // Given
    const fixture = await paidFixture("concurrent-keys")

    // When
    const responses = await Promise.all(["first", "second"].map((key) => request(app.getHttpServer())
      .post(`/staff/orders/${fixture.orderId}/refunds`).set(staffHeaders)
      .send(refundBody([firstLineIdOf(fixture)], `${scope}-${key}-key`))))

    // Then
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409])
    expect(responses.find((response) => response.status === 409)?.body.code).toBe("refund_line_already_refunded")
    await expect(dataSource.query("select status, amount_fen from refund_requests where order_id = ?", [fixture.orderId]))
      .resolves.toEqual([{ status: "pending", amount_fen: 12800 }])
  })

  it("returns a conflict when different orders concurrently reuse one idempotency key", async () => {
    // Given
    const first = await paidFixture("concurrent-order-a")
    const second = await paidFixture("concurrent-order-b")
    const idempotencyKey = `${scope}-cross-order-key`

    // When
    const responses = await Promise.all([first, second].map((fixture) => request(app.getHttpServer())
      .post(`/staff/orders/${fixture.orderId}/refunds`).set(staffHeaders)
      .send(refundBody([firstLineIdOf(fixture)], idempotencyKey))))

    // Then
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409])
    expect(responses.find((response) => response.status === 409)?.body.code).toBe("idempotency_conflict")
    await expect(dataSource.query("select idempotency_key from refund_requests where order_id in (?, ?)", [first.orderId, second.orderId]))
      .resolves.toEqual([{ idempotency_key: idempotencyKey }])
    await expect(dataSource.query("select l.amount_fen from refund_request_lines l join refund_requests r on r.id = l.refund_request_id where r.order_id in (?, ?)", [first.orderId, second.orderId]))
      .resolves.toEqual([{ amount_fen: 12800 }])
    await expect(dataSource.query("select a.action from audit_logs a join refund_requests r on r.id = a.target_id where r.order_id in (?, ?)", [first.orderId, second.orderId]))
      .resolves.toEqual([{ action: "refund.create" }])
  })

  it.each(["reason", "note", "lineIds"] as const)("rejects a replay when the same key changes %s", async (field) => {
    // Given
    const fixture = await paidFixture(`replay-${field}`)
    const body = refundBody([firstLineIdOf(fixture)], `${scope}-payload-key`)
    await createRefund(fixture, body.lineIds, body.idempotencyKey)
    const changed = { ...body, [field]: field === "lineIds" ? fixture.lineIds.slice(1) : "changed input" }

    // When
    const response = await request(app.getHttpServer()).post(`/staff/orders/${fixture.orderId}/refunds`)
      .set(staffHeaders).send(changed).expect(409)

    // Then
    expect(response.body.code).toBe("idempotency_conflict")
  })

  it("rejects a selected participant line from another order", async () => {
    // Given
    const first = await paidFixture("cross-line-a")
    const second = await paidFixture("cross-line-b")

    // When
    const response = await request(app.getHttpServer()).post(`/staff/orders/${first.orderId}/refunds`)
      .set(staffHeaders).send(refundBody([firstLineIdOf(second)], `${scope}-cross-line-key`)).expect(400)

    // Then
    expect(response.body.code).toBe("invalid_refund_selection")
  })

  it("rejects a new key for a participant whose refund already succeeded", async () => {
    // Given
    const fixture = await paidFixture("succeeded-repeat")
    const refund = await createRefund(fixture, [firstLineIdOf(fixture)], `${scope}-succeeded-key`)
    await processRefund(fixture.orderId, refund.body.id, "succeeded")

    // When
    const response = await request(app.getHttpServer()).post(`/staff/orders/${fixture.orderId}/refunds`)
      .set(staffHeaders).send(refundBody([firstLineIdOf(fixture)], `${scope}-new-key`)).expect(409)

    // Then
    expect(response.body.code).toBe("refund_line_already_refunded")
  })

  it("does not reveal refund history to another family or allow family refund management", async () => {
    // Given
    const fixture = await paidFixture("family-scope")
    const refund = await createRefund(fixture, [firstLineIdOf(fixture)], `${scope}-scope-key`)

    // When
    const otherFamily = await request(app.getHttpServer()).get(`/orders/${fixture.orderId}/detail`)
      .set(familyHeader(scope, "other")).expect(404)
    const familyCreate = await request(app.getHttpServer()).post(`/staff/orders/${fixture.orderId}/refunds`)
      .set(fixture.familyHeaders).send(refundBody(fixture.lineIds.slice(1), `${scope}-family-key`)).expect(401)
    const familyProcess = await request(app.getHttpServer()).post(`/staff/orders/${fixture.orderId}/refunds/${refund.body.id}/local-result`)
      .set(fixture.familyHeaders).send({ outcome: "succeeded" }).expect(401)

    // Then
    expect(otherFamily.body).not.toHaveProperty("refundHistory")
    expect(familyCreate.body).not.toHaveProperty("id")
    expect(familyProcess.body).not.toHaveProperty("id")
    await expect(dataSource.query("select status from refund_requests where id = ?", [refund.body.id])).resolves.toEqual([{ status: "pending" }])
  })

  it("fully refunds order and payment when all people are refunded", async () => {
    // Given
    const fixture = await paidFixture("full")

    // When
    const refund = await createRefund(fixture, fixture.lineIds, `${scope}-full-key`)
    await processRefund(fixture.orderId, refund.body.id, "succeeded")

    // Then
    await expect(dataSource.query("select status from orders where id = ?", [fixture.orderId])).resolves.toEqual([{ status: "refunded" }])
    await expect(dataSource.query("select status from payments where order_id = ?", [fixture.orderId])).resolves.toEqual([{ status: "refunded" }])
  })

  it("disables local result processing in production for a real staff session", async () => {
    // Given
    const fixture = await paidFixture("production")
    const refund = await createRefund(fixture, [firstLineIdOf(fixture)], `${scope}-production-key`)
    const cookie = await createStaffSession(`${scope}-admin`)
    const previousNodeEnv = process.env["NODE_ENV"]
    const previousOrigin = process.env["ADMIN_WEB_ORIGIN"]
    process.env["NODE_ENV"] = "production"
    process.env["ADMIN_WEB_ORIGIN"] = "http://admin.test"
    try {
      // When
      const response = await request(app.getHttpServer())
        .post(`/staff/orders/${fixture.orderId}/refunds/${refund.body.id}/local-result`)
        .set("Cookie", cookie)
        .set("Origin", "http://admin.test")
        .send({ outcome: "succeeded" })
        .expect(404)

      // Then
      expect(response.body.code).toBe("local_refund_unavailable")
    } finally {
      restoreNodeEnv(previousNodeEnv)
      restoreEnv("ADMIN_WEB_ORIGIN", previousOrigin)
    }
  })

  it("disables local refund request creation in production without writing refund rows", async () => {
    // Given
    const fixture = await paidFixture("production-create")
    const before = await refundSnapshot(fixture.orderId)
    const cookie = await createStaffSession(`${scope}-admin`)
    const previousNodeEnv = process.env["NODE_ENV"]
    const previousOrigin = process.env["ADMIN_WEB_ORIGIN"]
    process.env["NODE_ENV"] = "production"
    process.env["ADMIN_WEB_ORIGIN"] = "http://admin.test"
    try {
      // When
      const response = await request(app.getHttpServer())
        .post(`/staff/orders/${fixture.orderId}/refunds`)
        .set("Cookie", cookie)
        .set("Origin", "http://admin.test")
        .send(refundBody([firstLineIdOf(fixture)], `${scope}-production-create-key`))
        .expect(404)

      // Then
      expect(response.body.code).toBe("local_refund_unavailable")
      expect(await refundSnapshot(fixture.orderId)).toEqual(before)
    } finally {
      restoreNodeEnv(previousNodeEnv)
      restoreEnv("ADMIN_WEB_ORIGIN", previousOrigin)
    }
  })

  it("rejects staff without refund management permission", async () => {
    // Given
    const fixture = await paidFixture("permission")
    const cookie = await createStaffSession(`${scope}-finance`)

    // When
    const response = await request(app.getHttpServer()).post(`/staff/orders/${fixture.orderId}/refunds`)
      .set("Cookie", cookie)
      .send(refundBody([firstLineIdOf(fixture)], `${scope}-denied-key`))
      .expect(403)

    // Then
    expect(response.body.code).toBe("staff_scope_forbidden")
  })

  async function paidFixture(label: string): Promise<PaidRefundFixture> {
    catalog ??= await createCatalog(app, scope)
    fixtureIndex += 1
    const headers = familyHeader(scope, `${fixtureIndex}`)
    const memberIds: string[] = []
    for (let index = 0; index < 2; index += 1) {
      const member = await createMember({ app, scope, headers, catalog, displayName: `Refund Child ${String.fromCharCode(65 + index)}`, codeSuffix: `${index + 1}` })
      memberIds.push(member.id)
    }
    const enrollment = await request(app.getHttpServer()).post("/enrollments").set(headers).send(enrollmentBody({
      catalog, memberIds, contactName: "Refund Parent", emergencyContactName: "Refund Emergency", emergencyContactPhone: virtualPhone("0008"),
    })).expect(201)
    const fixture = { headers, enrollmentId: enrollment.body.id, tourSessionId: catalog.tourSessionId, participantIds: [] }
    await dataSource.query("update tour_sessions set price_fen = ? where id = ?", [12800, fixture.tourSessionId])
    const order = await createOrder(app, fixture, `${scope}-${label}-order`)
    await startMockPayment(app, fixture, order.id)
    await request(app.getHttpServer()).post("/payments/mock/events").set(fixture.headers).send(mockEventBody({
      eventId: `${scope}-${label}-paid`,
      orderId: order.id,
      transactionId: `${scope}-${label}-transaction`,
      amountFen: order.amountFen,
      status: "succeeded",
    })).expect(201)
    const detail = await request(app.getHttpServer()).get(`/staff/orders/${order.id}`).set(staffHeaders).expect(200)
    return {
      familyHeaders: fixture.headers,
      staffHeaders,
      financeHeaders,
      orderId: order.id,
      amountFen: order.amountFen,
      lineIds: detail.body.participants.map((participant: { readonly id: string }) => participant.id),
    }
  }

  function createRefund(fixture: PaidRefundFixture, lineIds: readonly string[], idempotencyKey: string) {
    return request(app.getHttpServer()).post(`/staff/orders/${fixture.orderId}/refunds`)
      .set(fixture.staffHeaders)
      .send(refundBody(lineIds, idempotencyKey))
      .expect(201)
  }

  function processRefund(orderId: string, refundId: string, outcome: "succeeded" | "failed") {
    return request(app.getHttpServer()).post(`/staff/orders/${orderId}/refunds/${refundId}/local-result`)
      .set(staffHeaders)
      .send(outcome === "failed" ? { outcome, failureMessage: "local provider rejected" } : { outcome })
      .expect(201)
  }
})

function firstLineIdOf(fixture: PaidRefundFixture): string {
  const lineId = fixture.lineIds[0]
  if (lineId === undefined) {
    throw new Error("paid refund fixture must include at least one order line")
  }
  return lineId
}

function refundBody(lineIds: readonly string[], idempotencyKey: string) {
  return { lineIds, reason: "parent cancellation", note: "called front desk", idempotencyKey }
}

async function refundSnapshot(orderId: string) {
  return Promise.all([
    dataSource.query("select * from orders where id = ?", [orderId]),
    dataSource.query("select * from order_lines where order_id = ? order by id", [orderId]),
    dataSource.query("select * from payments where order_id = ? order by id", [orderId]),
    dataSource.query("select e.* from enrollments e join orders o on o.enrollment_id = e.id where o.id = ?", [orderId]),
    dataSource.query("select r.* from roster_entries r join orders o on o.enrollment_id = r.enrollment_id where o.id = ? order by r.id", [orderId]),
    dataSource.query("select * from refund_requests where order_id = ? order by id", [orderId]),
    dataSource.query("select l.* from refund_request_lines l join refund_requests r on r.id = l.refund_request_id where r.order_id = ? order by l.id", [orderId]),
    dataSource.query("select a.* from audit_logs a join refund_requests r on r.id = a.target_id where r.order_id = ? order by a.id", [orderId]),
  ])
}

async function createStaffAccount(suffix: string, permissions: readonly string[]): Promise<Record<string, string>> {
  const staffId = `staff-${suffix}`
  await dataSource.query(
    "insert into staff_accounts (id, username, display_name, password_hash, status, force_password_change, failed_login_attempts, permissions_version, created_at, updated_at) values (?, ?, ?, ?, 'active', false, 0, 1, current_timestamp(6), current_timestamp(6))",
    [staffId, staffId, "Refund Operator", "dev-test-password-hash"],
  )
  for (const [index, permission] of permissions.entries()) {
    await dataSource.query(
      "insert into staff_account_permissions (id, staff_account_id, permission_key, created_at) values (?, ?, ?, current_timestamp(6))",
      [`perm-${suffix}-${index}`, staffId, permission],
    )
  }
  await dataSource.query(
    "insert into staff_account_scopes (id, staff_account_id, scope_kind, scope_id, created_at) values (?, ?, 'all', null, current_timestamp(6))",
    [`scope-${staffId}-all`, staffId],
  )
  return { "x-linan-dev-staff-id": staffId, "x-linan-dev-staff-role": "administrator" }
}

async function createStaffSession(suffix: string): Promise<string> {
  const staffId = `staff-${suffix}`
  const token = `session-${suffix}`
  await dataSource.query(
    "insert into staff_sessions (id, staff_account_id, token_hash, permissions_version, expires_at, revoked_at, created_at) values (?, ?, ?, 1, timestampadd(hour, 1, current_timestamp(6)), null, current_timestamp(6))",
    [`session-${suffix}`, staffId, hashToken(token)],
  )
  return `linan_staff_session=${encodeURIComponent(token)}`
}

async function cleanupRefundData(scope: string): Promise<void> {
  const familyPattern = `family-${scope}%`
  await dataSource.query(
    "delete rrl from refund_request_lines rrl join refund_requests rr on rr.id = rrl.refund_request_id join orders o on o.id = rr.order_id join enrollments e on e.id = o.enrollment_id join families f on f.id = e.family_id where f.code like ?",
    [familyPattern],
  )
  await dataSource.query(
    "delete al from audit_logs al join refund_requests rr on rr.id = al.target_id join orders o on o.id = rr.order_id join enrollments e on e.id = o.enrollment_id join families f on f.id = e.family_id where f.code like ? and al.target_type = 'refund_request'",
    [familyPattern],
  )
  await dataSource.query(
    "delete rr from refund_requests rr join orders o on o.id = rr.order_id join enrollments e on e.id = o.enrollment_id join families f on f.id = e.family_id where f.code like ?",
    [familyPattern],
  )
}

async function cleanupStaffData(scope: string): Promise<void> {
  await dataSource.query("delete from staff_sessions where staff_account_id like ?", [`staff-${scope}%`])
  await dataSource.query("delete from staff_account_permissions where staff_account_id like ?", [`staff-${scope}%`])
  await dataSource.query("delete from staff_account_scopes where staff_account_id like ?", [`staff-${scope}%`])
  await dataSource.query("delete from staff_accounts where id like ?", [`staff-${scope}%`])
}

function restoreEnv(name: string, previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env[name]
    return
  }
  process.env[name] = previous
}
