import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { InsuranceBatchPersonEntity, InsuranceHandoffEntity } from "../src/domain/entities/index.js"
import { closeCatalogTripDatabase, createCatalogTripApp, dataSource, databaseUrl, initializeCatalogTripDatabase } from "./catalog-trip-fixture.js"
import { CONTINUATION_ORIGIN } from "./business-continuation-fixture.js"
import { createInsuranceBatch, createInsuranceFixture, INSURANCE_HEADERS, insureBatch, resetInsuranceFixture, type InsuranceFixture } from "./insurance-plan-fixture.js"

const result = { success: true, receiptReference: "synthetic-dates-receipt", policyNumber: "SYNTHETIC-DATES", note: "本地日期回归" }

describe.skipIf(databaseUrl === undefined)("insurance manual dates over real MySQL HTTP", () => {
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

  it.each([
    { coverageStart: "2026-02-30", coverageEnd: "2026-03-01" },
    { coverageStart: "2027-02-28", coverageEnd: "2027-02-29" },
    { coverageStart: "2026-10-14", coverageEnd: "2026-10-13" },
  ])("rejects invalid dates without changing existing people or handoffs in case %#", async (dates) => {
    const batch = await createInsuranceBatch(app, fixture.catalog.tourSessionId)
    await insureBatch(app, batch)
    const people = await dataSource.manager.find(InsuranceBatchPersonEntity, { where: { batchId: batch.id }, order: { id: "ASC" } })
    const handoffs = await dataSource.manager.countBy(InsuranceHandoffEntity, { batchId: batch.id })
    const response = await request(app.getHttpServer()).post(`/insurance/batches/${batch.id}/manual-result`).set(INSURANCE_HEADERS).send({ ...result, ...dates })
    expect(response.status).toBe(400)
    expect(response.body.code).toBe("malformed_input")
    expect(await dataSource.manager.find(InsuranceBatchPersonEntity, { where: { batchId: batch.id }, order: { id: "ASC" } })).toEqual(people)
    expect(await dataSource.manager.countBy(InsuranceHandoffEntity, { batchId: batch.id })).toBe(handoffs)
  })

  it.each([
    { coverageStart: "2026-10-13", coverageEnd: "2026-10-13" },
    { coverageStart: "2028-02-29", coverageEnd: "2028-03-01" },
    { coverageStart: null, coverageEnd: "2026-10-13" },
    { coverageStart: "2026-10-13", coverageEnd: null },
  ])("saves valid dates and exposes them unchanged to the family in case %#", async (dates) => {
    const batch = await createInsuranceBatch(app, fixture.catalog.tourSessionId)
    await request(app.getHttpServer()).post(`/insurance/batches/${batch.id}/manual-result`).set(INSURANCE_HEADERS).send({ ...result, ...dates }).expect(201)
    const response = await request(app.getHttpServer()).get(`/orders/${fixture.orderId}/insurance`).set(fixture.owner).expect(200)
    expect(response.body.people[0].records[0]).toMatchObject({ status: "insured", policyNumber: result.policyNumber, ...dates })
  })
})
