import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { closeCatalogTripDatabase, createCatalogTripApp, createScope, databaseUrl, DEV_ADMIN_HEADERS, initializeCatalogTripDatabase } from "./catalog-trip-fixture.js"
import { createCatalog, familyHeader, resetEnrollmentConsentData, restoreNodeEnv } from "./enrollment-consent-fixture.js"
import { payEnrollment } from "./roster-export-fixture.js"

describe.skipIf(databaseUrl === undefined)("Traveler enrollment placement snapshot", () => {
  let app: INestApplication
  let previousEnv: string | undefined
  let previousKey: string | undefined
  const scope = createScope()
  beforeAll(async () => {
    previousEnv = process.env["NODE_ENV"]
    previousKey = process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"]
    process.env["NODE_ENV"] = "development"
    process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"] = Buffer.alloc(32, 12).toString("base64")
    await initializeCatalogTripDatabase()
    app = await createCatalogTripApp()
  })
  afterAll(async () => {
    await app.close()
    await resetEnrollmentConsentData(scope)
    await closeCatalogTripDatabase()
    restoreNodeEnv(previousEnv)
    if (previousKey === undefined) delete process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"]
    else process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"] = previousKey
  })

  it("keeps original class identity and scope after a saved participant moves to another class", async () => {
    // Given
    const catalog = await createCatalog(app, scope)
    await payEnrollment({ app, scope, catalog, family: "s", names: ["Snapshot Child"], status: "succeeded" })
    const grade = await request(app.getHttpServer()).post(`/schools/${catalog.schoolId}/grades`).set(DEV_ADMIN_HEADERS)
      .send({ code: `grade-${scope}-new`, name: "New Grade" }).expect(201)
    const schoolClass = await request(app.getHttpServer()).post(`/grades/${grade.body.id}/classes`).set(DEV_ADMIN_HEADERS)
      .send({ code: `class-${scope}-new`, name: "New Class" }).expect(201)
    const members = await request(app.getHttpServer()).get("/enrollment/members").set(familyHeader(scope, "s")).expect(200)
    await request(app.getHttpServer()).patch(`/enrollment/members/${members.body[0].id}`).set(familyHeader(scope, "s"))
      .send({ gradeId: grade.body.id, classId: schoolClass.body.id }).expect(200)
    // When
    const result = await request(app.getHttpServer()).get(`/travelers/sessions/${catalog.tourSessionId}`).set(DEV_ADMIN_HEADERS).expect(200)
    // Then
    expect(result.body.travelers).toEqual([expect.objectContaining({ gradeId: catalog.gradeId, classId: catalog.classId, gradeName: "Grade One", className: "Class One" })])
    const original = await request(app.getHttpServer()).get(`/travelers/sessions/${catalog.tourSessionId}`).set(DEV_ADMIN_HEADERS)
      .query({ classId: catalog.classId }).expect(200)
    expect(original.body.travelers).toHaveLength(1)
    const moved = await request(app.getHttpServer()).get(`/travelers/sessions/${catalog.tourSessionId}`).set(DEV_ADMIN_HEADERS)
      .query({ classId: schoolClass.body.id }).expect(200)
    expect(moved.body.travelers).toHaveLength(0)
  })
})
