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

describe.skipIf(databaseUrl === undefined)("School catalog mutation and rejection", () => {
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

  it("updates trips and rejects duplicate class keys foreign-key deletes and bad school catalog pairs", async () => {
    const schoolA = await request(app.getHttpServer())
      .post("/schools")
      .send({ code: `school-${scope}-a`, name: "Mutation School A" })
      .expect(201)
    const schoolB = await request(app.getHttpServer())
      .post("/schools")
      .send({ code: `school-${scope}-b`, name: "Mutation School B" })
      .expect(201)
    const grade = await request(app.getHttpServer())
      .post(`/schools/${schoolA.body.id}/grades`)
      .send({ code: `grade-${scope}`, name: "Mutation Grade" })
      .expect(201)

    await request(app.getHttpServer())
      .post(`/grades/${grade.body.id}/classes`)
      .send({ code: `class-${scope}`, name: "Class A" })
      .expect(201)
    await request(app.getHttpServer())
      .post(`/grades/${grade.body.id}/classes`)
      .send({ code: `class-${scope}`, name: "Class B" })
      .expect(409)

    const catalogA = await request(app.getHttpServer())
      .post("/catalog-items")
      .send({ organizationId: schoolA.body.id, code: `catalog-${scope}-a`, title: "Trip A", status: "active" })
      .expect(201)
    const catalogB = await request(app.getHttpServer())
      .post("/catalog-items")
      .send({ organizationId: schoolB.body.id, code: `catalog-${scope}-b`, title: "Trip B", status: "active" })
      .expect(201)

    const session = await request(app.getHttpServer())
      .post("/tour-sessions")
      .send({
        organizationId: schoolA.body.id,
        catalogItemId: catalogA.body.id,
        code: `session-${scope}`,
        status: "draft",
        priceFen: 12_800,
        capacity: 30,
        startsAt: "2026-10-03T01:00:00.000Z",
        endsAt: "2026-10-03T09:00:00.000Z",
        enrollmentOpensAt: "2026-09-20T01:00:00.000Z",
        enrollmentClosesAt: "2026-10-01T09:00:00.000Z",
      })
      .expect(201)

    const updatedSession = await request(app.getHttpServer())
      .patch(`/tour-sessions/${session.body.id}`)
      .send({
        status: "published",
        priceFen: 13_900,
        startsAt: "2026-10-04T01:00:00.000Z",
        endsAt: "2026-10-04T09:00:00.000Z",
      })
      .expect(200)
    expect(updatedSession.body).toMatchObject({
      status: "published",
      priceFen: 13_900,
      startsAt: "2026-10-04T01:00:00.000Z",
    })

    await request(app.getHttpServer())
      .post("/tour-sessions")
      .send({
        organizationId: schoolA.body.id,
        catalogItemId: catalogB.body.id,
        code: `session-${scope}-cross-school`,
        status: "published",
        priceFen: 10_000,
        capacity: 30,
        startsAt: "2026-10-03T01:00:00.000Z",
        endsAt: "2026-10-03T09:00:00.000Z",
        enrollmentOpensAt: "2026-09-20T01:00:00.000Z",
        enrollmentClosesAt: "2026-10-01T09:00:00.000Z",
      })
      .expect(400)

    await request(app.getHttpServer())
      .post("/tour-sessions")
      .send({
        organizationId: schoolA.body.id,
        catalogItemId: catalogA.body.id,
        code: `session-${scope}-negative`,
        status: "published",
        priceFen: -1,
        capacity: 30,
        startsAt: "2026-10-03T01:00:00.000Z",
        endsAt: "2026-10-03T09:00:00.000Z",
        enrollmentOpensAt: "2026-09-20T01:00:00.000Z",
        enrollmentClosesAt: "2026-10-01T09:00:00.000Z",
      })
      .expect(400)

    await request(app.getHttpServer()).delete(`/schools/${schoolA.body.id}`).expect(409)
    await request(app.getHttpServer())
      .patch(`/tour-sessions/${session.body.id}`)
      .send({ status: "closed" })
      .expect(200)
    await request(app.getHttpServer())
      .get(`/tour-sessions/${session.body.id}/enrollment-availability`)
      .query({ at: "2026-09-21T01:00:00.000Z" })
      .expect(400)
    await request(app.getHttpServer())
      .get(`/tour-sessions/${session.body.id}/enrollment-availability`)
      .query({ at: "2026-09-19T01:00:00.000Z" })
      .expect(400)
  })
})
