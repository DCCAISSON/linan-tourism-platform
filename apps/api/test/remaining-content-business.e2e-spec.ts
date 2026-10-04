// allow: SIZE_OK — Todo14 requires one owned DB e2e spec; splitting would exceed the assigned file scope.
import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  closeCatalogTripDatabase,
  createCatalogTripApp,
  createScope,
  dataSource,
  databaseUrl,
  DEV_ADMIN_HEADERS,
  initializeCatalogTripDatabase,
} from "./catalog-trip-fixture.js"
import {
  type CatalogFixture,
  createCatalog,
  createMember,
  enrollmentBody,
  familyHeader,
  restoreNodeEnv,
  studentIdentityMemberBody,
  virtualPhone,
  virtualResidentId,
} from "./enrollment-consent-fixture.js"
import { createOrder, mockEventBody, resetMockPaymentData, startMockPayment } from "./mock-payment-fixture.js"
import { schoolStaffHeaders } from "./roster-export-fixture.js"
import { hashToken, STAFF_SESSION_COOKIE } from "../src/modules/iam/staff-session-token.js"

const ORIGIN = "http://127.0.0.1:5173"
const STAFF_HEADERS = { ...DEV_ADMIN_HEADERS, Origin: ORIGIN } as const
const PERSON_DATA_KEY = Buffer.alloc(32, 14).toString("base64")

type PaidOrderFixture = {
  readonly headers: Record<string, string>
  readonly enrollmentId: string
  readonly orderId: string
  readonly lineIds: readonly string[]
  readonly tourSessionId: string
}

type CountRow = { readonly count: string | number }
type IdRow = { readonly id: string }
let app: INestApplication
let scope: string
let identitySequence = 300

if (databaseUrl === undefined) describe("Todo14 DB guard", () => {
  it("does not run real DB scenarios until DOMAIN_TEST_DATABASE_URL is provided", () => {
    expect(databaseUrl).toBeUndefined()
  })
})

if (databaseUrl !== undefined) {
describe("Todo14 remaining content and business DB e2e", () => {
  let previousNodeEnv: string | undefined
  let previousOrigin: string | undefined
  let previousPersonKey: string | undefined

  beforeAll(initializeCatalogTripDatabase)

  beforeEach(async () => {
    scope = createScope()
    identitySequence = 300
    process.stdout.write(`[todo14-scope:content-business] ${scope}\n`)
    previousNodeEnv = process.env["NODE_ENV"]
    previousOrigin = process.env["ADMIN_WEB_ORIGIN"]
    previousPersonKey = process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"]
    process.env["NODE_ENV"] = "development"
    process.env["ADMIN_WEB_ORIGIN"] = ORIGIN
    process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"] = PERSON_DATA_KEY
    app = await createCatalogTripApp()
  })

  afterEach(async () => {
    try {
      await app.close()
    } finally {
      await cleanup(scope)
      restoreNodeEnv(previousNodeEnv)
      restoreEnv("ADMIN_WEB_ORIGIN", previousOrigin)
      restoreEnv("PERSON_DATA_ENCRYPTION_KEY_BASE64", previousPersonKey)
    }
  })

  afterAll(closeCatalogTripDatabase)

  it("persists evaluation standards, internal observations, scoped school rows, and reviewed public feedback", async () => {
    const catalog = await createCatalog(app, `${scope}-e`)
    const otherCatalog = await createCatalog(app, `${scope}-o`)
    const evaluationStaffId = scopedId("staff", "evaluation-operator")
    await insertStaff(evaluationStaffId, catalog.schoolId, ["evaluations.read", "evaluations.write", "evaluations.confirm", "evaluations.standard.write", "evaluations.standard.confirm", "feedback.read", "feedback.review"], { kind: "all", id: null })
    const evaluationHeaders = { Cookie: await insertStaffSession(evaluationStaffId, "evaluation"), Origin: ORIGIN }
    const paid = await payEnrollmentForCatalog(catalog, "e", ["Eval Student A", "Eval Student B"])
    const personRefs = paid.lineIds.map((lineId) => `paid:${lineId}`)

    await request(app.getHttpServer())
      .post("/evaluations/staff/batch")
      .set(evaluationHeaders)
      .send({
        tourSessionId: catalog.tourSessionId,
        standardId: null,
        observations: [{ personRef: personRefs[0], internalComment: "Internal only", excellent: true, attention: false, gradeCode: null }],
        idempotencyKey: `eval-internal-${scope}`,
      })
      .expect(201)

    await request(app.getHttpServer())
      .post("/evaluations/staff/batch")
      .set(evaluationHeaders)
      .send({
        tourSessionId: catalog.tourSessionId,
        standardId: null,
        observations: [{ personRef: personRefs[0], internalComment: "No standard", excellent: false, attention: false, gradeCode: "A" }],
        idempotencyKey: `eval-no-standard-${scope}`,
      })
      .expect(400)

    const standard = await request(app.getHttpServer())
      .post("/evaluations/staff/standards")
      .set(evaluationHeaders)
      .send({
        tourSessionId: catalog.tourSessionId,
        title: "Todo14 A/B standard",
        items: [
          { code: "A", label: "优秀", description: "Meets the A standard" },
          { code: "B", label: "合格", description: "Meets the B standard" },
        ],
        publicFormatNote: "School report exports confirmed A/B only",
      })
      .expect(201)
    await request(app.getHttpServer())
      .post(`/evaluations/staff/standards/${String(standard.body.id)}/confirm`)
      .set(evaluationHeaders)
      .send({ expectedVersion: Number(standard.body.version), confirmed: true })
      .expect(201)

    await request(app.getHttpServer())
      .post("/evaluations/staff/batch")
      .set(evaluationHeaders)
      .send({
        tourSessionId: catalog.tourSessionId,
        standardId: String(standard.body.id),
        observations: [
          { personRef: personRefs[0], internalComment: "A after standard", excellent: true, attention: false, gradeCode: "A" },
          { personRef: personRefs[1], internalComment: "B after standard", excellent: false, attention: true, gradeCode: "B" },
        ],
        idempotencyKey: `eval-graded-${scope}`,
      })
      .expect(201)
    await request(app.getHttpServer()).post(`/evaluations/staff/sessions/${catalog.tourSessionId}/confirm`).set(evaluationHeaders).expect(201)

    const schoolRows = await request(app.getHttpServer())
      .get(`/evaluations/school/sessions/${catalog.tourSessionId}`)
      .set(schoolStaffHeaders(catalog.schoolId))
      .query({ organizationId: catalog.schoolId })
      .expect(200)
    expect(schoolRows.body).toHaveLength(2)
    expect(JSON.stringify(schoolRows.body)).not.toContain("internalComment")
    await request(app.getHttpServer())
      .get(`/evaluations/school/sessions/${catalog.tourSessionId}`)
      .set(schoolStaffHeaders(otherCatalog.schoolId))
      .query({ organizationId: otherCatalog.schoolId })
      .expect(403)

    const feedback = await request(app.getHttpServer())
      .post("/feedback/family")
      .set(paid.headers)
      .send({
        tourSessionId: catalog.tourSessionId,
        source: "family",
        orderId: paid.orderId,
        rating: 5,
        content: "Private family feedback content",
        contactName: "Eval Parent",
        allowPublic: true,
        idempotencyKey: `feedback-${scope}`,
      })
      .expect(201)
    expect(feedback.body.public).toBe(false)
    const feedbackRows = await request(app.getHttpServer()).get(`/feedback/staff/sessions/${catalog.tourSessionId}`).set(evaluationHeaders).expect(200)
    const feedbackItem = feedbackRows.body.items.find((item: { readonly id: string }) => item.id === String(feedback.body.id))
    if (feedbackItem === undefined) throw new Error("feedback dashboard did not read back the submitted item")
    await request(app.getHttpServer())
      .post(`/feedback/staff/${String(feedback.body.id)}/review`)
      .set(evaluationHeaders)
      .send({ expectedVersion: Number(feedbackItem.version), status: "published", publicExcerpt: "Reviewed public excerpt" })
      .expect(201)
    const publicFeedback = await request(app.getHttpServer()).get(`/feedback/public/sessions/${catalog.tourSessionId}`).expect(200)
    expect(publicFeedback.body).toEqual([expect.objectContaining({ publicExcerpt: "Reviewed public excerpt" })])
    expect(JSON.stringify(publicFeedback.body)).not.toContain("Private family feedback content")

    const evaluationRows = await dataSource.query("select grade_code, internal_comment, confirmed_at from student_evaluations where tour_session_id = ? order by person_ref", [catalog.tourSessionId])
    const storedFeedback = await dataSource.query("select status, public_excerpt from service_feedback where id = ?", [String(feedback.body.id)])
    expect(evaluationRows).toHaveLength(2)
    expect(evaluationRows.map((row: { readonly grade_code: string }) => row.grade_code)).toEqual(["A", "B"])
    expect(String(evaluationRows[0]?.internal_comment)).toBe("A after standard")
    expect(storedFeedback).toEqual([expect.objectContaining({ status: "published", public_excerpt: "Reviewed public excerpt" })])
  })

  it("blocks insurance missing identity and conflicts, records manual policy receipts, and leaves insurance unchanged after refund execution", async () => {
    const blockedCatalog = await createCatalog(app, `${scope}-ib`)
    const blocked = await payEnrollmentForCatalog(blockedCatalog, "ib", ["No Identity", "Conflict A", "Conflict B"])
    await makeMissingIdentity(blocked.lineIds[0])
    await makeDuplicateIdentity(blocked.lineIds[1], blocked.lineIds[2])
    const blockedPreview = await request(app.getHttpServer()).get(`/insurance/sessions/${blockedCatalog.tourSessionId}/preview`).set(STAFF_HEADERS).expect(200)
    expect(blockedPreview.body).toMatchObject({ missingIdentityCount: 1 })
    expect(Number(blockedPreview.body.conflictCount)).toBeGreaterThan(0)
    const blockedBatch = await request(app.getHttpServer())
      .post("/insurance/batches")
      .set(STAFF_HEADERS)
      .send({ tourSessionId: blockedCatalog.tourSessionId, expectedRosterVersion: String(blockedPreview.body.rosterVersion), companyTemplateName: null })
      .expect(201)
    expect(blockedBatch.body.status).toBe("blocked")
    expect(blockedBatch.body.people.map((person: { readonly issueCode: string | null }) => person.issueCode)).toEqual(expect.arrayContaining(["missing_identity", "traveler_conflict"]))
    await request(app.getHttpServer())
      .post(`/insurance/batches/${String(blockedBatch.body.id)}/submit`)
      .set(STAFF_HEADERS)
      .send({ expectedRosterVersion: String(blockedPreview.body.rosterVersion), receiptReference: "handoff-blocked", note: "blocked rows cannot submit" })
      .expect(409)

    const cleanCatalog = await createCatalog(app, `${scope}-ic`)
    const clean = await payEnrollmentForCatalog(cleanCatalog, "ic", ["Clean Traveler"])
    const cleanPreview = await request(app.getHttpServer()).get(`/insurance/sessions/${cleanCatalog.tourSessionId}/preview`).set(STAFF_HEADERS).expect(200)
    const cleanBatch = await request(app.getHttpServer())
      .post("/insurance/batches")
      .set(STAFF_HEADERS)
      .send({ tourSessionId: cleanCatalog.tourSessionId, expectedRosterVersion: String(cleanPreview.body.rosterVersion), companyTemplateName: "carrier-template" })
      .expect(201)
    const submitted = await request(app.getHttpServer())
      .post(`/insurance/batches/${String(cleanBatch.body.id)}/submit`)
      .set(STAFF_HEADERS)
      .send({ expectedRosterVersion: String(cleanPreview.body.rosterVersion), receiptReference: "handoff-clean", note: "sent to carrier" })
      .expect(201)
    expect(submitted.body.status).toBe("submitted")
    const insured = await request(app.getHttpServer())
      .post(`/insurance/batches/${String(cleanBatch.body.id)}/manual-result`)
      .set(STAFF_HEADERS)
      .send({ success: true, receiptReference: "receipt-clean", policyNumber: "POLICY-TODO14", coverageStart: "2026-10-01", coverageEnd: "2026-10-02", note: "carrier confirmed" })
      .expect(201)
    expect(insured.body.status).toBe("insured")

    await payEnrollmentForCatalog(cleanCatalog, "ia", ["Added Traveler"])
    const diff = await request(app.getHttpServer()).get(`/insurance/batches/${String(cleanBatch.body.id)}/diff`).set(STAFF_HEADERS).expect(200)
    expect(diff.body.rosterChanged).toBe(true)
    expect(diff.body.addedRefs.length).toBeGreaterThan(0)

    const refundApplication = await request(app.getHttpServer())
      .post(`/orders/${clean.orderId}/refund-applications`)
      .set(clean.headers)
      .send({ lineIds: [clean.lineIds[0]], reason: "family cancellation", idempotencyKey: `refund-app-${scope}` })
      .expect(201)
    const refundStaffId = scopedId("staff", "refund-operator")
    await insertStaff(refundStaffId, cleanCatalog.schoolId, ["refunds.review", "refunds.execute"], { kind: "all", id: null })
    const refundStaffCookie = await insertStaffSession(refundStaffId, "refund")
    await request(app.getHttpServer())
      .post(`/staff/refund-applications/${String(refundApplication.body.id)}/review`)
      .set({ Cookie: refundStaffCookie, Origin: ORIGIN })
      .send({ decision: "approved", reason: "approved for local execution" })
      .expect(201)
    await request(app.getHttpServer())
      .post(`/staff/refund-applications/${String(refundApplication.body.id)}/execute`)
      .set({ Cookie: refundStaffCookie, Origin: ORIGIN })
      .send({ outcome: "succeeded", failureMessage: null })
      .expect(201)

    const people = await dataSource.query("select status, policy_number from insurance_batch_people where batch_id = ? order by person_ref", [String(cleanBatch.body.id)])
    const handoffs = await dataSource.query("select kind from insurance_handoffs where batch_id = ? order by created_at", [String(cleanBatch.body.id)])
    const refundRows = await dataSource.query("select status, refund_request_id from refund_applications where id = ?", [String(refundApplication.body.id)])
    expect(people).toEqual([expect.objectContaining({ status: "insured", policy_number: "POLICY-TODO14" })])
    expect(handoffs.map((row: { readonly kind: string }) => row.kind)).toEqual(["submitted", "manual_success"])
    expect(refundRows).toEqual([expect.objectContaining({ status: "approved" })])
  })

  it("verifies media publish visibility, family isolation, and guide assignment from persisted rows", async () => {
    const ownerCatalog = await createCatalog(app, `${scope}-mo`)
    const otherCatalog = await createCatalog(app, `${scope}-mx`)
    const ownerOrder = await payEnrollmentForCatalog(ownerCatalog, "mo", ["Media Owner"])
    const otherOrder = await payEnrollmentForCatalog(otherCatalog, "mx", ["Media Other"])
    const staffId = scopedId("staff", "media-author")
    const guideId = scopedId("staff", "media-guide")
    await insertStaff(staffId, ownerCatalog.schoolId, ["media.read"], { kind: "all", id: null })
    const guideCookie = await insertGuideSession(guideId, ownerCatalog.tourSessionId)
    const publishedId = scopedId("media", "published")
    const draftId = scopedId("media", "draft")
    const otherId = scopedId("media", "other")
    await seedMediaAsset({ id: publishedId, sessionId: ownerCatalog.tourSessionId, authorId: staffId, title: "Published owner asset", status: "published" })
    await seedMediaAsset({ id: draftId, sessionId: ownerCatalog.tourSessionId, authorId: staffId, title: "Draft owner asset", status: "draft" })
    await seedMediaAsset({ id: otherId, sessionId: otherCatalog.tourSessionId, authorId: staffId, title: "Other family asset", status: "published" })

    await request(app.getHttpServer()).get(`/staff/media/sessions/${ownerCatalog.tourSessionId}`).set({ Cookie: guideCookie }).expect(403)
    await dataSource.query(
      "insert into execution_guide_assignments (id, staff_account_id, tour_session_id, vehicle_id, scope_key, active, version, reason, updated_by, created_at, updated_at) values (?, ?, ?, null, 'session', true, 1, ?, ?, current_timestamp(6), current_timestamp(6))",
      [scopedId("assignment", "guide"), guideId, ownerCatalog.tourSessionId, "todo14 assignment", staffId],
    )
    const guideList = await request(app.getHttpServer()).get(`/staff/media/sessions/${ownerCatalog.tourSessionId}`).set({ Cookie: guideCookie }).expect(200)
    expect(guideList.body.assets.map((asset: { readonly id: string }) => asset.id)).toEqual(expect.arrayContaining([publishedId, draftId]))

    const signingEnvironment = {
      TENCENT_CLOUD_COS_BUCKET: "local-signing-fixture-1250000000",
      TENCENT_CLOUD_REGION: "ap-shanghai",
      TENCENT_CLOUD_SECRET_ID: "synthetic-local-signing-id",
      TENCENT_CLOUD_SECRET_KEY: "synthetic-local-signing-key",
    }
    const previousSigningEnvironment = Object.keys(signingEnvironment).map((name) => ({ name, value: process.env[name] }))
    try {
      Object.assign(process.env, signingEnvironment)
      const ownerList = await request(app.getHttpServer()).get(`/orders/${ownerOrder.orderId}/media`).set(ownerOrder.headers).expect(200)
      const otherList = await request(app.getHttpServer()).get(`/orders/${otherOrder.orderId}/media`).set(otherOrder.headers).expect(200)
      expect(ownerList.body.assets.map((asset: { readonly id: string }) => asset.id)).toEqual([publishedId])
      expect(otherList.body.assets.map((asset: { readonly id: string }) => asset.id)).toEqual([otherId])
    } finally {
      for (const previous of previousSigningEnvironment) restoreEnv(previous.name, previous.value)
    }
    const stored = await dataSource.query("select id, status from media_assets where id in (?, ?, ?) order by id", [publishedId, draftId, otherId])
    expect(stored).toHaveLength(3)
  })

  it("keeps CRM adult marketing and tourism wellness homestay inquiries separate from booking payment inventory", async () => {
    const catalog = await createCatalog(app, `${scope}-b`)
    const ownerStaffId = scopedId("staff", "business-owner")
    await insertStaff(ownerStaffId, catalog.schoolId, ["business.followup", "crm.write"], { kind: "organization", id: catalog.schoolId })

    const customer = await request(app.getHttpServer())
      .post("/staff/crm/contacts")
      .set(STAFF_HEADERS)
      .send({
        organizationId: catalog.schoolId,
        displayName: "Todo14 Adult Customer",
        birthDate: "1990-01-01",
        adultConfirmed: true,
        phone: "13800000000",
        source: "manual",
        tags: ["todo14"],
        marketingConsent: "granted",
        ownerId: ownerStaffId,
        familyId: null,
        idempotencyKey: `crm-${scope}`,
      })
      .expect(201)
    await request(app.getHttpServer())
      .post(`/staff/crm/contacts/${String(customer.body.id)}/followups`)
      .set(STAFF_HEADERS)
      .send({ content: "Followed up with adult customer", nextFollowupAt: null, idempotencyKey: `crm-follow-${scope}` })
      .expect(201)
    await request(app.getHttpServer()).get(`/staff/crm/contacts/${String(customer.body.id)}/contact`).set(STAFF_HEADERS).query({ reason: "todo14 callback" }).expect(200)
    await request(app.getHttpServer()).get("/staff/crm/export.csv").set(STAFF_HEADERS).query({ organizationId: catalog.schoolId, tag: "todo14" }).expect(200)
    await request(app.getHttpServer())
      .post("/staff/crm/contacts")
      .set(STAFF_HEADERS)
      .send({ organizationId: catalog.schoolId, displayName: "Minor", birthDate: "2015-01-01", adultConfirmed: true, phone: "13800000001", source: "manual", tags: [], marketingConsent: "unknown", ownerId: null, familyId: null, idempotencyKey: `crm-minor-${scope}` })
      .expect(400)
    await request(app.getHttpServer())
      .post("/staff/crm/contacts")
      .set(STAFF_HEADERS)
      .send({ organizationId: catalog.schoolId, displayName: "Health Injection", birthDate: "1990-01-01", adultConfirmed: true, phone: "13800000002", source: "manual", tags: [], marketingConsent: "unknown", ownerId: null, familyId: null, idempotencyKey: `crm-health-${scope}`, health: "not allowed" })
      .expect(400)
    await request(app.getHttpServer())
      .post("/staff/crm/contacts")
      .set(STAFF_HEADERS)
      .send({ organizationId: catalog.schoolId, displayName: "Evaluation Injection", birthDate: "1990-01-01", adultConfirmed: true, phone: "13800000003", source: "manual", tags: [], marketingConsent: "unknown", ownerId: null, familyId: null, idempotencyKey: `crm-eval-${scope}`, evaluation: "not allowed" })
      .expect(400)

    const commercialBefore = await commercialCounts(catalog.schoolId)
    const productIds: string[] = []
    for (const category of ["tourism", "wellness", "homestay"] as const) {
      const product = await request(app.getHttpServer())
        .post("/business/staff/products")
        .set(STAFF_HEADERS)
        .send(businessProduct(catalog.schoolId, category, `${category} published package`))
        .expect(201)
      productIds.push(String(product.body.id))
      const publicList = await request(app.getHttpServer()).get("/business/products").query({ category }).expect(200)
      expect(publicList.body.map((item: { readonly id: string }) => item.id)).toContain(String(product.body.id))
      await request(app.getHttpServer()).get(`/business/products/${String(product.body.id)}`).expect(200)
    }
    const inquiry = await request(app.getHttpServer())
      .post(`/business/products/${productIds[0]}/inquiries`)
      .send({ idempotencyKey: `inquiry-${scope}`, customerType: "organization", organizationName: "Todo14 Org", contactName: "Business Contact", phone: "13800001111", request: "Need a tourism plan" })
      .expect(201)
    const inquiryDetail = await request(app.getHttpServer()).get(`/business/staff/inquiries/${String(inquiry.body.id)}`).set(STAFF_HEADERS).expect(200)
    await request(app.getHttpServer())
      .post(`/business/staff/inquiries/${String(inquiry.body.id)}/followups`)
      .set(STAFF_HEADERS)
      .send({ idempotencyKey: `inquiry-follow-${scope}`, expectedVersion: Number(inquiryDetail.body.version), status: "processing", ownerStaffAccountId: ownerStaffId, note: "Assigned to business owner" })
      .expect(201)
    const commercialAfter = await commercialCounts(catalog.schoolId)
    const crmRows = await dataSource.query("select id, marketing_consent from crm_customers where organization_id = ?", [catalog.schoolId])
    const crmAudits = await dataSource.query("select action from audit_logs where organization_id = ? and action like 'crm.%' order by created_at", [catalog.schoolId])
    const inquiryRows = await dataSource.query("select status, owner_staff_account_id from business_inquiries where id = ?", [String(inquiry.body.id)])
    expect(commercialAfter).toEqual(commercialBefore)
    expect(crmRows).toEqual([expect.objectContaining({ marketing_consent: "granted" })])
    expect(crmAudits.map((row: { readonly action: string }) => row.action)).toEqual(expect.arrayContaining(["crm.contact.read", "crm.export.masked"]))
    expect(inquiryRows).toEqual([expect.objectContaining({ status: "processing", owner_staff_account_id: ownerStaffId })])
  })
})
}

async function payEnrollmentForCatalog(catalog: CatalogFixture, family: string, names: readonly string[]): Promise<PaidOrderFixture> {
  const headers = familyHeader(scope, family)
  const memberIds: string[] = []
  for (const [index, name] of names.entries()) {
    const code = `member-${scope}-${family}-${index}`
    const identity = { participantKind: "student" as const, identityNumber: virtualResidentId("20100101", String(identitySequence).padStart(3, "0")), phone: virtualPhone(String(identitySequence)) }
    identitySequence += 1
    const member = await createMember({ app, scope, headers, catalog, displayName: name, codeSuffix: `${family}-${index}`, body: studentIdentityMemberBody(catalog, name, code, identity) })
    memberIds.push(member.id)
  }
  const enrollment = await request(app.getHttpServer())
    .post("/enrollments")
    .set(headers)
    .send(enrollmentBody({ catalog, memberIds, contactName: `${family} parent`, emergencyContactName: `${family} emergency`, emergencyContactPhone: virtualPhone("0010") }))
    .expect(201)
  const fixture = { headers, enrollmentId: String(enrollment.body.id), tourSessionId: catalog.tourSessionId, participantIds: [] }
  const order = await createOrder(app, fixture, `order-${scope}-${family}`)
  const payment = await startMockPayment(app, fixture, order.id)
  await request(app.getHttpServer())
    .post("/payments/mock/events")
    .set(headers)
    .send(mockEventBody({ eventId: `event-${scope}-${family}`, orderId: order.id, transactionId: `transaction-${scope}-${family}`, amountFen: payment.amountFen, status: "succeeded" }))
    .expect(201)
  const lineRows: readonly IdRow[] = await dataSource.query("select id from order_lines where order_id = ? order by id", [order.id])
  return { headers, enrollmentId: String(enrollment.body.id), orderId: order.id, lineIds: lineRows.map((row) => row.id), tourSessionId: catalog.tourSessionId }
}

async function makeMissingIdentity(lineId: string | undefined): Promise<void> {
  if (lineId === undefined) throw new Error("missing order line for identity test")
  await dataSource.query("update order_lines set identity_hash_snapshot = null, identity_ciphertext_snapshot = null, identity_masked_snapshot = null where id = ?", [lineId])
}

async function makeDuplicateIdentity(sourceLineId: string | undefined, targetLineId: string | undefined): Promise<void> {
  if (sourceLineId === undefined || targetLineId === undefined) throw new Error("missing order line for conflict test")
  const rows: readonly { readonly identity_hash_snapshot: string | null }[] = await dataSource.query("select identity_hash_snapshot from order_lines where id = ?", [sourceLineId])
  const hash = rows[0]?.identity_hash_snapshot
  if (hash === undefined || hash === null) throw new Error("source identity hash missing")
  await dataSource.query("update order_lines set identity_hash_snapshot = ? where id = ?", [hash, targetLineId])
}

async function insertStaff(id: string, organizationId: string, permissions: readonly string[], scopeInput: { readonly kind: "all" | "organization" | "tour_session"; readonly id: string | null }): Promise<void> {
  await dataSource.query(
    "insert into staff_accounts (id, username, display_name, password_hash, status, force_password_change, failed_login_attempts, permissions_version, created_at, updated_at) values (?, ?, ?, 'test-hash', 'active', false, 0, 1, current_timestamp(6), current_timestamp(6))",
    [id, id, id],
  )
  for (const [permissionIndex, permission] of permissions.entries()) {
    await dataSource.query("insert into staff_account_permissions (id, staff_account_id, permission_key, created_at) values (?, ?, ?, current_timestamp(6))", [scopedId("perm", `${id.slice(-12)}-${permissionIndex}-${permission}`), id, permission])
  }
  await dataSource.query("insert into staff_account_scopes (id, staff_account_id, scope_kind, scope_id, created_at) values (?, ?, ?, ?, current_timestamp(6))", [scopedId("scope", id), id, scopeInput.kind, scopeInput.id])
  if (organizationId.length === 0) throw new Error("organization id is required for staff fixture")
}

async function insertGuideSession(guideId: string, tourSessionId: string): Promise<string> {
  await insertStaff(guideId, tourSessionId, ["media.read"], { kind: "tour_session", id: tourSessionId })
  return insertStaffSession(guideId, "guide")
}

async function insertStaffSession(staffId: string, suffix: string): Promise<string> {
  const token = scopedId("token", suffix)
  await dataSource.query(
    "insert into staff_sessions (id, staff_account_id, token_hash, permissions_version, expires_at, revoked_at, created_at) values (?, ?, ?, 1, date_add(current_timestamp(6), interval 1 day), null, current_timestamp(6))",
    [scopedId("session", suffix), staffId, hashToken(token)],
  )
  return `${STAFF_SESSION_COOKIE}=${encodeURIComponent(token)}`
}

async function seedMediaAsset(input: { readonly id: string; readonly sessionId: string; readonly authorId: string; readonly title: string; readonly status: "draft" | "published" }): Promise<void> {
  await dataSource.query(
    "insert into media_assets (id, tour_session_id, author_staff_id, request_id, content_hash, object_key, title, kind, content_type, byte_size, status, version, cleanup_pending, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, 'image', 'image/jpeg', 12, ?, 1, false, current_timestamp(6), current_timestamp(6))",
    [input.id, input.sessionId, input.authorId, `req-${input.id}`, scopedId("hash", input.id), `media/${input.sessionId}/${input.id}.jpg`, input.title, input.status],
  )
}

function businessProduct(organizationId: string, category: "tourism" | "wellness" | "homestay", title: string) {
  return {
    organizationId,
    category,
    title,
    offering: `${category} service package`,
    content: `${category} public content`,
    referencePriceFen: 1000,
    customerServicePhone: "13800002222",
    bookingUrl: "",
    bookingAuthorized: false,
    media: [],
    mediaAuthorized: false,
    status: "published",
  }
}

async function commercialCounts(organizationId: string): Promise<readonly number[]> {
  const rows = await Promise.all([
    dataSource.query("select count(*) as count from orders o join enrollments e on e.id = o.enrollment_id where e.organization_id = ?", [organizationId]),
    dataSource.query("select count(*) as count from payments p join orders o on o.id = p.order_id join enrollments e on e.id = o.enrollment_id where e.organization_id = ?", [organizationId]),
    dataSource.query("select count(*) as count from roster_entries where organization_id = ?", [organizationId]),
  ])
  return rows.map((result: readonly CountRow[]) => Number(result[0]?.count ?? 0))
}

function scopedId(prefix: string, suffix: string): string {
  return `${prefix}-${scope.slice(-12)}-${suffix.replace(/[^A-Za-z0-9_-]/g, "-")}`.slice(0, 64)
}

function restoreEnv(key: string, previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env[key]
    return
  }
  process.env[key] = previous
}

async function cleanup(currentScope: string): Promise<void> {
  const orgPattern = `school-${currentScope}%`
  const sessionPattern = `session-${currentScope}%`
  const familyPattern = `family-${currentScope}%`
  const staffPattern = `staff-${currentScope.slice(-12)}-%`
  await dataSource.query("delete bf from business_followups bf join business_inquiries bi on bi.id = bf.inquiry_id join organizations o on o.id = bi.organization_id where o.code like ?", [orgPattern])
  await dataSource.query("delete bi from business_inquiries bi join organizations o on o.id = bi.organization_id where o.code like ?", [orgPattern])
  await dataSource.query("delete bp from business_products bp join organizations o on o.id = bp.organization_id where o.code like ?", [orgPattern])
  await dataSource.query("delete cf from crm_followups cf join crm_customers cc on cc.id = cf.customer_id join organizations o on o.id = cc.organization_id where o.code like ?", [orgPattern])
  await dataSource.query("delete cc from crm_customers cc join organizations o on o.id = cc.organization_id where o.code like ?", [orgPattern])
  await dataSource.query("delete from service_feedback where organization_id in (select id from organizations where code like ?)", [orgPattern])
  await dataSource.query("delete from student_evaluations where organization_id in (select id from organizations where code like ?)", [orgPattern])
  await dataSource.query("delete es from evaluation_standards es join tour_sessions ts on ts.id = es.tour_session_id where ts.code like ?", [sessionPattern])
  await dataSource.query("delete from media_assets where tour_session_id in (select id from tour_sessions where code like ?)", [sessionPattern])
  await dataSource.query("delete from media_providers where tour_session_id in (select id from tour_sessions where code like ?)", [sessionPattern])
  await dataSource.query("delete ih from insurance_handoffs ih join insurance_batches ib on ib.id = ih.batch_id join tour_sessions ts on ts.id = ib.tour_session_id where ts.code like ?", [sessionPattern])
  await dataSource.query("delete ip from insurance_batch_people ip join insurance_batches ib on ib.id = ip.batch_id join tour_sessions ts on ts.id = ib.tour_session_id where ts.code like ?", [sessionPattern])
  await dataSource.query("delete ib from insurance_batches ib join tour_sessions ts on ts.id = ib.tour_session_id where ts.code like ?", [sessionPattern])
  await dataSource.query("delete rrl from refund_request_lines rrl join refund_requests rr on rr.id = rrl.refund_request_id join orders o on o.id = rr.order_id join enrollments e on e.id = o.enrollment_id join families f on f.id = e.family_id where f.code like ?", [familyPattern])
  await dataSource.query("delete ra from refund_applications ra join orders o on o.id = ra.order_id join enrollments e on e.id = o.enrollment_id join families f on f.id = e.family_id where f.code like ?", [familyPattern])
  await dataSource.query("delete rr from refund_requests rr join orders o on o.id = rr.order_id join enrollments e on e.id = o.enrollment_id join families f on f.id = e.family_id where f.code like ?", [familyPattern])
  await dataSource.query("delete from execution_guide_assignments where staff_account_id like ? or tour_session_id in (select id from tour_sessions where code like ?)", [staffPattern, sessionPattern])
  await dataSource.query("delete from staff_sessions where staff_account_id like ?", [staffPattern])
  await dataSource.query("delete from staff_account_scopes where staff_account_id like ?", [staffPattern])
  await dataSource.query("delete from staff_account_permissions where staff_account_id like ?", [staffPattern])
  await dataSource.query("delete from staff_accounts where id like ?", [staffPattern])
  await resetMockPaymentData(currentScope)
}
