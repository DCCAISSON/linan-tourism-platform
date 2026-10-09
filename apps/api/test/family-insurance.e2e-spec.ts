import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { closeCatalogTripDatabase, createCatalogTripApp, databaseUrl, dataSource, initializeCatalogTripDatabase } from "./catalog-trip-fixture.js"
import { CONTINUATION_ORIGIN, continuationHeaders, createContinuationActor } from "./business-continuation-fixture.js"
import { createInsuranceBatch, createInsuranceFixture, INSURANCE_HEADERS, insureBatch, resetInsuranceFixture, TEST_INSURANCE_PLAN, type InsuranceFixture } from "./insurance-plan-fixture.js"

describe.skipIf(databaseUrl === undefined)("own-family insurance history over real MySQL HTTP", () => {
  let app: INestApplication
  let fixture: InsuranceFixture
  beforeAll(async () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("ADMIN_WEB_ORIGIN", CONTINUATION_ORIGIN)
    await initializeCatalogTripDatabase()
    app = await createCatalogTripApp()
  })
  beforeEach(async () => { fixture = await createInsuranceFixture(app) })
  afterEach(async () => { await resetInsuranceFixture(fixture) })
  afterAll(async () => { await app.close(); await closeCatalogTripDatabase(); vi.unstubAllEnvs() })

  it("denies another family's order and unauthenticated queries", async () => {
    // Given
    const endpoint = `/orders/${fixture.orderId}/insurance`
    // When
    const other = await request(app.getHttpServer()).get(endpoint).set(fixture.other).expect(404)
    const anonymous = await request(app.getHttpServer()).get(endpoint).expect(401)
    // Then
    expect(other.body.code).toBe("not_found")
    expect(anonymous.body.people).toBeUndefined()
  })

  it("returns the current plan and empty records when no insurance batch exists", async () => {
    // Given
    await request(app.getHttpServer()).put(`/insurance/sessions/${fixture.catalog.tourSessionId}/plan`).set(INSURANCE_HEADERS).send({ plan: TEST_INSURANCE_PLAN }).expect(200)
    // When
    const response = await request(app.getHttpServer()).get(`/orders/${fixture.orderId}/insurance`).set(fixture.owner).expect(200)
    // Then
    expect(response.body).toEqual({ orderId: fixture.orderId, tourSessionId: fixture.catalog.tourSessionId, currentPlan: TEST_INSURANCE_PLAN,
      people: [{ orderLineId: fixture.line.id, displayName: "本订单学生", refundStatus: "none", records: [] }] })
  })

  it("keeps legacy snapshots null and older insured records visible beside a new draft", async () => {
    // Given
    const old = await createInsuranceBatch(app, fixture.catalog.tourSessionId)
    await insureBatch(app, old)
    await request(app.getHttpServer()).put(`/insurance/sessions/${fixture.catalog.tourSessionId}/plan`).set(INSURANCE_HEADERS).send({ plan: TEST_INSURANCE_PLAN }).expect(200)
    const newer = await createInsuranceBatch(app, fixture.catalog.tourSessionId)
    // When
    const response = await request(app.getHttpServer()).get(`/orders/${fixture.orderId}/insurance`).set(fixture.owner).expect(200)
    // Then
    expect(response.body.people).toHaveLength(1)
    expect(response.body.people[0].records).toEqual([
      expect.objectContaining({ batchId: newer.id, batchStatus: "draft", status: "ready", planSnapshot: TEST_INSURANCE_PLAN, policyNumber: null }),
      expect.objectContaining({ batchId: old.id, batchStatus: "insured", status: "insured", planSnapshot: null, policyNumber: "SYNTHETIC-POLICY", coverageStart: "2027-02-01", coverageEnd: "2027-02-02" }),
    ])
    expect(JSON.stringify(response.body)).not.toMatch(/其他家庭学生|PRIVATE_|identity|phone|sourceRefs|receiptReference|handoffs|issueCode/)
    expect(Object.keys(response.body.people[0].records[1]).sort()).toEqual(["batchId", "batchStatus", "coverageEnd", "coverageStart", "createdAt", "planSnapshot", "policyNumber", "status", "submittedAt"].sort())
  })

  it("finds a merged insurance person through sourceRefs when the representative is imported", async () => {
    // Given
    const batch = await createInsuranceBatch(app, fixture.catalog.tourSessionId)
    await dataSource.query("update insurance_batch_people set person_ref=?, source_refs_json=?, display_name=? where batch_id=? and person_ref=?", ["imported:synthetic-source", JSON.stringify(["imported:synthetic-source", `paid:${fixture.line.id}`]), "内部合并代表姓名", batch.id, `paid:${fixture.line.id}`])
    // When
    const response = await request(app.getHttpServer()).get(`/orders/${fixture.orderId}/insurance`).set(fixture.owner).expect(200)
    // Then
    expect(response.body.people).toEqual([{ orderLineId: fixture.line.id, displayName: "本订单学生", refundStatus: "none", records: [expect.objectContaining({ batchId: batch.id, status: "ready" })] }])
    expect(JSON.stringify(response.body)).not.toContain("内部合并代表姓名")
  })

  it("keeps insurance history after a real local refund and distinguishes a pending batch change", async () => {
    // Given
    const batch = await createInsuranceBatch(app, fixture.catalog.tourSessionId)
    await insureBatch(app, batch)
    const operator = await createContinuationActor(app, fixture.scope, "refund", ["refunds.manage"], { kind: "all", id: null })
    const refund = await request(app.getHttpServer()).post(`/staff/orders/${fixture.orderId}/refunds`).set(continuationHeaders(operator))
      .send({ lineIds: [fixture.line.id], reason: "本地合成退款", note: null, idempotencyKey: `${fixture.scope}-refund` }).expect(201)
    await request(app.getHttpServer()).post(`/staff/orders/${fixture.orderId}/refunds/${String(refund.body.id)}/local-result`).set(continuationHeaders(operator)).send({ outcome: "succeeded", failureMessage: null }).expect(201)
    await request(app.getHttpServer()).post(`/insurance/batches/${batch.id}/change-handoffs`).set(INSURANCE_HEADERS).send({ kind: "cancellation_change", note: "PRIVATE_STAFF_NOTE", receiptReference: null }).expect(201)
    await createInsuranceBatch(app, fixture.catalog.tourSessionId)
    // When
    const response = await request(app.getHttpServer()).get(`/orders/${fixture.orderId}/insurance`).set(fixture.owner).expect(200)
    // Then
    expect(response.body.people[0]).toMatchObject({ refundStatus: "refunded", records: [expect.objectContaining({ batchId: batch.id, batchStatus: "change_pending", status: "insured", policyNumber: "SYNTHETIC-POLICY" })] })
  })

  it("does not infer coverage dates from the trip when the manual result has no dates", async () => {
    // Given
    const batch = await createInsuranceBatch(app, fixture.catalog.tourSessionId)
    await request(app.getHttpServer()).post(`/insurance/batches/${batch.id}/manual-result`).set(INSURANCE_HEADERS).send({ success: true, policyNumber: "SYNTHETIC-NODATE", receiptReference: "PRIVATE_RECEIPT", note: "PRIVATE_STAFF_NOTE" }).expect(201)
    // When
    const response = await request(app.getHttpServer()).get(`/orders/${fixture.orderId}/insurance`).set(fixture.owner).expect(200)
    // Then
    expect(response.body.people[0].records[0]).toMatchObject({ status: "insured", coverageStart: null, coverageEnd: null })
  })
})
