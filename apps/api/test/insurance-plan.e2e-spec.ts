import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { closeCatalogTripDatabase, createCatalogTripApp, databaseUrl, initializeCatalogTripDatabase } from "./catalog-trip-fixture.js"
import { CONTINUATION_ORIGIN, continuationHeaders, createContinuationActor } from "./business-continuation-fixture.js"
import { createInsuranceBatch, createInsuranceFixture, INSURANCE_HEADERS, insureBatch, resetInsuranceFixture, TEST_INSURANCE_PLAN, type InsuranceFixture } from "./insurance-plan-fixture.js"

describe.skipIf(databaseUrl === undefined)("session insurance plans over real MySQL HTTP", () => {
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

  it("persists a normalized plan at the maximum field lengths", async () => {
    // Given
    const plan = { insurerName: "甲".repeat(120), planName: "乙".repeat(120), coverageSummary: "丙".repeat(4000), notice: "丁".repeat(2000) }
    const padded = Object.fromEntries(Object.entries(plan).map(([key, value]) => [key, `  ${value}  `]))
    // When
    const saved = await request(app.getHttpServer()).put(`/insurance/sessions/${fixture.catalog.tourSessionId}/plan`).set(INSURANCE_HEADERS).send({ plan: padded }).expect(200)
    // Then
    expect(saved.body).toEqual({ tourSessionId: fixture.catalog.tourSessionId, plan })
    const loaded = await request(app.getHttpServer()).get(`/insurance/sessions/${fixture.catalog.tourSessionId}/plan`).set(INSURANCE_HEADERS).expect(200)
    expect(loaded.body).toEqual(saved.body)
  })

  it("rejects writes with the wrong Origin or insufficient permission", async () => {
    // Given
    const endpoint = `/insurance/sessions/${fixture.catalog.tourSessionId}/plan`
    const reader = await createContinuationActor(app, fixture.scope, "reader", ["insurance.read"], { kind: "all", id: null })
    // When
    const origin = await request(app.getHttpServer()).put(endpoint).set({ ...INSURANCE_HEADERS, Origin: "https://unrelated.invalid" }).send({ plan: TEST_INSURANCE_PLAN }).expect(403)
    const permission = await request(app.getHttpServer()).put(endpoint).set(continuationHeaders(reader)).send({ plan: TEST_INSURANCE_PLAN }).expect(403)
    // Then
    expect(origin.body.code).toBe("staff_origin_forbidden")
    expect(permission.body.code).toBe("insurance_permission_forbidden")
    expect((await request(app.getHttpServer()).get(endpoint).set(continuationHeaders(reader)).expect(200)).body.plan).toBeNull()
  })

  it("rejects reads and writes outside the staff session scope", async () => {
    // Given
    const actor = await createContinuationActor(app, fixture.scope, "scope", ["insurance.read", "insurance.write"], { kind: "tour_session", id: "unrelated-session" })
    const endpoint = `/insurance/sessions/${fixture.catalog.tourSessionId}/plan`
    // When
    const read = await request(app.getHttpServer()).get(endpoint).set(continuationHeaders(actor)).expect(409)
    const write = await request(app.getHttpServer()).put(endpoint).set(continuationHeaders(actor)).send({ plan: TEST_INSURANCE_PLAN }).expect(409)
    // Then
    expect(read.body.code).toBe("insurance_scope_forbidden")
    expect(write.body.code).toBe("insurance_scope_forbidden")
  })

  it("keeps batch plan snapshots unchanged after current plan updates and clearing", async () => {
    // Given
    const endpoint = `/insurance/sessions/${fixture.catalog.tourSessionId}/plan`
    await request(app.getHttpServer()).put(endpoint).set(INSURANCE_HEADERS).send({ plan: TEST_INSURANCE_PLAN }).expect(200)
    const batch = await createInsuranceBatch(app, fixture.catalog.tourSessionId)
    await insureBatch(app, batch)
    const secondPlan = { ...TEST_INSURANCE_PLAN, planName: "合成方案B" }
    await request(app.getHttpServer()).put(endpoint).set(INSURANCE_HEADERS).send({ plan: secondPlan }).expect(200)
    const second = await createInsuranceBatch(app, fixture.catalog.tourSessionId)
    // When
    await request(app.getHttpServer()).put(endpoint).set(INSURANCE_HEADERS).send({ plan: null }).expect(200)
    const family = await request(app.getHttpServer()).get(`/orders/${fixture.orderId}/insurance`).set(fixture.owner).expect(200)
    // Then
    expect(family.body.currentPlan).toBeNull()
    expect(family.body.people[0].records).toEqual([
      expect.objectContaining({ batchId: second.id, planSnapshot: secondPlan, status: "ready" }),
      expect.objectContaining({ batchId: batch.id, planSnapshot: TEST_INSURANCE_PLAN, status: "insured" }),
    ])
  })

  it("rejects invalid plans without changing the saved plan", async () => {
    // Given
    const endpoint = `/insurance/sessions/${fixture.catalog.tourSessionId}/plan`
    await request(app.getHttpServer()).put(endpoint).set(INSURANCE_HEADERS).send({ plan: TEST_INSURANCE_PLAN }).expect(200)
    // When
    for (const plan of [{ ...TEST_INSURANCE_PLAN, coverageSummary: " " }, { ...TEST_INSURANCE_PLAN, notice: "x".repeat(2001) }, { ...TEST_INSURANCE_PLAN, unexpected: true }]) {
      await request(app.getHttpServer()).put(endpoint).set(INSURANCE_HEADERS).send({ plan }).expect(400)
    }
    // Then
    expect((await request(app.getHttpServer()).get(endpoint).set(INSURANCE_HEADERS).expect(200)).body.plan).toEqual(TEST_INSURANCE_PLAN)
  })
})
