import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  closeCatalogTripDatabase,
  createCatalogTripApp,
  createScope,
  databaseUrl,
  initializeCatalogTripDatabase,
  resetCatalogTripData,
} from "./catalog-trip-fixture.js"

describe.skipIf(databaseUrl === undefined)("School catalog and trip configuration", () => {
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
    await resetCatalogTripData(scope)
  })

  afterAll(async () => {
    await closeCatalogTripDatabase()
  })

  it("creates and reads two schools with different prices and trip dates", async () => {
    const schoolA = await request(app.getHttpServer())
      .post("/schools")
      .send({ code: `school-${scope}-a`, name: "Catalog Trip School A" })
      .expect(201)
    const schoolB = await request(app.getHttpServer())
      .post("/schools")
      .send({ code: `school-${scope}-b`, name: "Catalog Trip School B" })
      .expect(201)
    const grade = await request(app.getHttpServer())
      .post(`/schools/${schoolA.body.id}/grades`)
      .send({ code: `grade-${scope}-a`, name: "Grade A" })
      .expect(201)

    await request(app.getHttpServer())
      .post(`/grades/${grade.body.id}/classes`)
      .send({ code: `class-${scope}-a`, name: "Class A" })
      .expect(201)

    const catalogA = await request(app.getHttpServer())
      .post("/catalog-items")
      .send({
        organizationId: schoolA.body.id,
        code: `catalog-${scope}-a`,
        title: "Qingshan Lake Study Trip",
        status: "active",
      })
      .expect(201)
    const catalogB = await request(app.getHttpServer())
      .post("/catalog-items")
      .send({
        organizationId: schoolB.body.id,
        code: `catalog-${scope}-b`,
        title: "Tianmu Mountain Study Trip",
        status: "active",
      })
      .expect(201)

    const sessionA = await request(app.getHttpServer())
      .post("/tour-sessions")
      .send({
        organizationId: schoolA.body.id,
        catalogItemId: catalogA.body.id,
        code: `session-${scope}-a`,
        status: "published",
        priceFen: 12_800,
        capacity: 30,
        startsAt: "2026-10-03T01:00:00.000Z",
        endsAt: "2026-10-03T09:00:00.000Z",
        enrollmentOpensAt: "2026-09-20T01:00:00.000Z",
        enrollmentClosesAt: "2026-10-01T09:00:00.000Z",
      })
      .expect(201)

    await request(app.getHttpServer())
      .post("/tour-sessions")
      .send({
        organizationId: schoolB.body.id,
        catalogItemId: catalogB.body.id,
        code: `session-${scope}-b`,
        status: "published",
        priceFen: 15_600,
        capacity: 24,
        startsAt: "2026-10-05T01:00:00.000Z",
        endsAt: "2026-10-05T09:00:00.000Z",
        enrollmentOpensAt: "2026-09-22T01:00:00.000Z",
        enrollmentClosesAt: "2026-10-02T09:00:00.000Z",
      })
      .expect(201)

    await request(app.getHttpServer())
      .get(`/tour-sessions/${sessionA.body.id}/enrollment-availability`)
      .query({ at: "2026-09-21T01:00:00.000Z" })
      .expect(200)

    const sessions = await request(app.getHttpServer()).get("/tour-sessions").expect(200)
    expect(sessions.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: `session-${scope}-a`,
          organizationId: schoolA.body.id,
          priceFen: 12_800,
          startsAt: "2026-10-03T01:00:00.000Z",
        }),
        expect.objectContaining({
          code: `session-${scope}-b`,
          organizationId: schoolB.body.id,
          priceFen: 15_600,
          startsAt: "2026-10-05T01:00:00.000Z",
        }),
      ]),
    )
  })
})
