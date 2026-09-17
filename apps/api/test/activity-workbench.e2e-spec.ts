import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import {
  closeCatalogTripDatabase, createCatalogTripApp, createScope, dataSource, databaseUrl,
  DEV_ADMIN_HEADERS, initializeCatalogTripDatabase,
} from "./catalog-trip-fixture.js"
import { createCatalog, restoreNodeEnv } from "./enrollment-consent-fixture.js"
import { resetMockPaymentData } from "./mock-payment-fixture.js"
import { payEnrollment, schoolStaffHeaders } from "./roster-export-fixture.js"

describe.skipIf(databaseUrl === undefined)("Activity content and operator workbench", () => {
  let app: INestApplication
  let scope: string

  beforeAll(initializeCatalogTripDatabase)
  beforeEach(async () => {
    scope = createScope()
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-09-17T00:00:00.000Z"))
    app = await createCatalogTripApp()
  })
  afterEach(async () => {
    await app.close()
    await resetMockPaymentData(scope)
    vi.useRealTimers()
  })
  afterAll(closeCatalogTripDatabase)

  it("persists introduction and cover while old catalog requests remain valid", async () => {
    const catalog = await createCatalog(app, scope)
    const rows: readonly { readonly id: string }[] = await dataSource.query(
      "select id from catalog_items where organization_id = ?", [catalog.schoolId],
    )
    const item = rows[0]
    if (item === undefined) throw new Error("catalog fixture missing")
    const old = await request(app.getHttpServer()).get("/catalog-items").expect(200)
    expect(old.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: item.id, description: "", coverImageUrl: "" })]))
    await request(app.getHttpServer()).patch(`/catalog-items/${item.id}`).set(DEV_ADMIN_HEADERS)
      .send({ description: "湖畔生态观察课程", coverImageUrl: "https://assets.example.org/lake.jpg" }).expect(200)
    const result = await request(app.getHttpServer()).get("/catalog-items").expect(200)
    expect(result.body).toEqual(expect.arrayContaining([expect.objectContaining({
      id: item.id, description: "湖畔生态观察课程", coverImageUrl: "https://assets.example.org/lake.jpg",
    })]))
  })

  it("reports real lifetime paid totals and only published trips in the next thirty days", async () => {
    const baseline = await request(app.getHttpServer()).get("/roster/workbench").set(DEV_ADMIN_HEADERS).expect(200)
    const catalog = await createCatalog(app, scope)
    const other = await createCatalog(app, `${scope}-o`)
    await dataSource.query("update tour_sessions set starts_at = ?, ends_at = ? where id = ?", [
      new Date("2026-09-20T00:00:00.000Z"), new Date("2026-09-21T00:00:00.000Z"), catalog.tourSessionId,
    ])
    await dataSource.query("update catalog_items set status = 'inactive' where organization_id = ?", [other.schoolId])
    await payEnrollment({ app, scope, catalog, family: "paid", names: ["本校学生甲", "本校学生乙"], status: "succeeded" })
    await payEnrollment({ app, scope, catalog, family: "failed", names: ["未付款学生"], status: "failed" })
    await payEnrollment({ app, scope: `${scope}-o`, catalog: other, family: "paid", names: ["外校学生"], status: "succeeded" })
    const result = await request(app.getHttpServer()).get("/roster/workbench").set(DEV_ADMIN_HEADERS).expect(200)
    expect(result.body).toMatchObject({
      generatedAt: "2026-09-17T00:00:00.000Z", upcomingFrom: "2026-09-17T00:00:00.000Z",
      upcomingUntil: "2026-10-17T00:00:00.000Z",
      activeActivityCount: baseline.body.activeActivityCount + 1,
      upcomingSessionCount: baseline.body.upcomingSessionCount + 1,
      paidHeadcount: baseline.body.paidHeadcount + 3, paidAmountFen: baseline.body.paidAmountFen + 3600,
    })
    expect(result.body.upcomingSessions).toEqual(expect.arrayContaining([expect.objectContaining({
      id: catalog.tourSessionId, schoolName: "Enrollment School", activityTitle: "Enrollment Trip",
      startsAt: "2026-09-20T00:00:00.000Z", priceFen: 1200, capacity: 30, status: "published",
    })]))
    expect(result.body.upcomingSessions.some((session: { readonly id: string }) => session.id === other.tourSessionId)).toBe(false)
  })

  it("denies school staff and missing identities instead of exposing global totals", async () => {
    const catalog = await createCatalog(app, scope)
    const denied = await request(app.getHttpServer()).get("/roster/workbench").set(schoolStaffHeaders(catalog.schoolId)).expect(403)
    expect(denied.body.code).toBe("staff_scope_forbidden")
    await request(app.getHttpServer()).get("/roster/workbench").expect(401)
  })

  it("includes the start boundary but excludes the end boundary, past and draft trips", async () => {
    const atStart = await createCatalog(app, scope)
    const atEnd = await createCatalog(app, `${scope}-end`)
    const past = await createCatalog(app, `${scope}-past`)
    const draft = await createCatalog(app, `${scope}-draft`)
    await dataSource.query("update tour_sessions set starts_at = ? where id = ?", [new Date("2026-09-17T00:00:00Z"), atStart.tourSessionId])
    await dataSource.query("update tour_sessions set starts_at = ? where id = ?", [new Date("2026-10-17T00:00:00Z"), atEnd.tourSessionId])
    await dataSource.query("update tour_sessions set starts_at = ? where id = ?", [new Date("2026-09-16T23:59:59Z"), past.tourSessionId])
    await dataSource.query("update tour_sessions set starts_at = ?, status = 'draft' where id = ?", [new Date("2026-09-20T00:00:00Z"), draft.tourSessionId])
    const result = await request(app.getHttpServer()).get("/roster/workbench").set(DEV_ADMIN_HEADERS).expect(200)
    const ids = result.body.upcomingSessions.map((session: { readonly id: string }) => session.id)
    expect(ids).toContain(atStart.tourSessionId)
    expect(ids).not.toContain(atEnd.tourSessionId)
    expect(ids).not.toContain(past.tourSessionId)
    expect(ids).not.toContain(draft.tourSessionId)
  })

  it("rejects administrator development headers in production", async () => {
    const previous = process.env["NODE_ENV"]
    process.env["NODE_ENV"] = "production"
    try {
      const denied = await request(app.getHttpServer()).get("/roster/workbench").set(DEV_ADMIN_HEADERS).expect(401)
      expect(denied.body.code).toBe("staff_identity_unavailable")
    } finally {
      restoreNodeEnv(previous)
    }
  })
})
