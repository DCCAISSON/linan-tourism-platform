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
import { createCatalog, virtualPhone } from "./enrollment-consent-fixture.js"
import { resetMockPaymentData } from "./mock-payment-fixture.js"
import { collectBinary, payEnrollment, schoolStaffHeaders } from "./roster-export-fixture.js"

describe.skipIf(databaseUrl === undefined)("Staff role and data-scope matrix", () => {
  let app: INestApplication
  let scope: string

  beforeAll(async () => {
    await initializeCatalogTripDatabase()
  })

  beforeEach(async () => {
    scope = createScope()
    app = await createCatalogTripApp()
  })

  afterEach(async () => {
    await app.close()
    await resetMockPaymentData(scope)
  })

  afterAll(async () => {
    await closeCatalogTripDatabase()
  })

  it("allows each staff role only its assigned data surface", async () => {
    const catalog = await createCatalog(app, scope)
    const otherCatalog = await createCatalog(app, `${scope}-other`)
    await payEnrollment({ app, scope, catalog, family: "m", names: ["权限测试学生"], status: "succeeded" })

    const school = schoolStaffHeaders(catalog.schoolId)
    const guide = guideHeaders(catalog.tourSessionId)
    const finance = financeHeaders()

    await request(app.getHttpServer())
      .get("/roster/summary")
      .set(school)
      .query({ tourSessionId: catalog.tourSessionId })
      .expect(200)
    await request(app.getHttpServer())
      .get("/roster/summary")
      .set(guide)
      .query({ tourSessionId: catalog.tourSessionId })
      .expect(200)
    const paymentSummary = await request(app.getHttpServer())
      .get("/roster/payment-summary")
      .set(finance)
      .query({ tourSessionId: catalog.tourSessionId })
      .expect(200)
    await request(app.getHttpServer())
      .get("/roster/export.xlsx")
      .set(DEV_ADMIN_HEADERS)
      .query({ tourSessionId: catalog.tourSessionId })
      .buffer(true)
      .parse(collectBinary)
      .expect(200)

    expect(paymentSummary.body).toMatchObject({ paidHeadcount: 1, paidAmountFen: 1200 })
    expect(paymentSummary.body).not.toHaveProperty("rows")

    await request(app.getHttpServer())
      .get("/roster/summary")
      .set(schoolStaffHeaders(otherCatalog.schoolId))
      .query({ tourSessionId: catalog.tourSessionId })
      .expect(403)
    await request(app.getHttpServer())
      .get("/roster/summary")
      .set(guideHeaders(otherCatalog.tourSessionId))
      .query({ tourSessionId: catalog.tourSessionId })
      .expect(403)
    await request(app.getHttpServer())
      .get("/roster/summary")
      .set(finance)
      .query({ tourSessionId: catalog.tourSessionId })
      .expect(403)

    const guideExport = await request(app.getHttpServer())
      .get("/roster/export.xlsx")
      .set(guide)
      .query({ tourSessionId: catalog.tourSessionId })
      .expect(403)
    const financeExport = await request(app.getHttpServer())
      .get("/roster/export.xlsx")
      .set(finance)
      .query({ tourSessionId: catalog.tourSessionId })
      .expect(403)
    expect(guideExport.headers["content-disposition"]).toBeUndefined()
    expect(financeExport.headers["content-disposition"]).toBeUndefined()

    await request(app.getHttpServer())
      .post("/schools")
      .set(school)
      .send({ code: `school-${scope}-forbidden`, name: "Forbidden School" })
      .expect(403)
    await request(app.getHttpServer())
      .post("/schools")
      .set({ "x-linan-dev-staff-role": "administrator" })
      .send({ code: `school-${scope}-missing-actor`, name: "Missing Actor" })
      .expect(401)
  })

  it("records agreement and export decisions without sensitive values", async () => {
    const catalog = await createCatalog(app, scope)
    await payEnrollment({ app, scope, catalog, family: "a", names: ["审计测试学生"], status: "succeeded" })

    await request(app.getHttpServer())
      .get("/roster/export.xlsx")
      .set(guideHeaders(catalog.tourSessionId))
      .query({ tourSessionId: catalog.tourSessionId })
      .expect(403)

    const rows: readonly AuditRow[] = await queryAuditRows(catalog.schoolId)
    expect(rows.map((row) => row.action)).toEqual(expect.arrayContaining(["agreement.confirmed", "roster.export.denied"]))
    expect(rows.every(hasRequiredAuditFields)).toBe(true)
    expect(JSON.stringify(rows)).not.toContain("审计测试学生")
    expect(JSON.stringify(rows)).not.toContain(virtualPhone("0009"))
  })
})

type AuditRow = {
  readonly actorId: string
  readonly action: string
  readonly targetType: string
  readonly targetId: string
  readonly createdAt: Date
}

function guideHeaders(tourSessionId: string): Record<string, string> {
  return {
    "x-linan-dev-staff-id": "dev-guide",
    "x-linan-dev-staff-role": "guide",
    "x-linan-dev-guide-tour-session-id": tourSessionId,
  }
}

function financeHeaders(): Record<string, string> {
  return { "x-linan-dev-staff-id": "dev-finance", "x-linan-dev-staff-role": "finance" }
}

async function queryAuditRows(organizationId: string): Promise<readonly AuditRow[]> {
  return dataSource.query(
    "select actor_id as actorId, action, target_type as targetType, target_id as targetId, created_at as createdAt from audit_logs where organization_id = ? order by created_at",
    [organizationId],
  )
}

function hasRequiredAuditFields(row: AuditRow): boolean {
  return row.actorId.length > 0 && row.action.length > 0 && row.targetType.length > 0 && row.targetId.length > 0 && row.createdAt instanceof Date
}
