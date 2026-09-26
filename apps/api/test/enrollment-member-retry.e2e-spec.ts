import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { closeCatalogTripDatabase, createCatalogTripApp, createScope, dataSource, databaseUrl, DEV_ADMIN_HEADERS, initializeCatalogTripDatabase } from "./catalog-trip-fixture.js"
import { createCatalog, familyHeader, memberBody, resetEnrollmentConsentData, restoreNodeEnv, virtualResidentId } from "./enrollment-consent-fixture.js"

describe.skipIf(databaseUrl === undefined)("Enrollment member retry", () => {
  let app: INestApplication
  let scope: string
  let previousEnv: string | undefined
  let previousKey: string | undefined
  beforeAll(initializeCatalogTripDatabase)
  beforeEach(async () => {
    scope = createScope()
    previousEnv = process.env["NODE_ENV"]
    previousKey = process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"]
    process.env["NODE_ENV"] = "development"
    process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"] = Buffer.alloc(32, 7).toString("base64")
    app = await createCatalogTripApp()
  })
  afterEach(async () => {
    await app.close()
    await resetEnrollmentConsentData(scope)
    restoreNodeEnv(previousEnv)
    if (previousKey === undefined) delete process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"]
    else process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"] = previousKey
  })
  afterAll(closeCatalogTripDatabase)

  it("returns the persisted member when an identical request is retried after a lost response", async () => {
    // Given
    const catalog = await createCatalog(app, scope)
    const headers = familyHeader(scope, "r")
    const body = { ...memberBody(catalog, "Retry Child", `member-${scope}-r`), saveAsCommon: false }
    const first = await request(app.getHttpServer()).post("/enrollment/members").set(headers).send(body).expect(201)
    // When
    const retry = await request(app.getHttpServer()).post("/enrollment/members").set(headers).send(body).expect(201)
    // Then
    expect(retry.body).toEqual(first.body)
    const rows: readonly { id: string }[] = await dataSource.query("SELECT id FROM family_members WHERE code = ?", [body.code])
    expect(rows).toEqual([{ id: first.body.id }])
  })

  it.each([
    { displayName: "Changed Name" },
    { phone: "19900009999" },
    { identityNumber: virtualResidentId("20100101", "005") },
    { saveAsCommon: true },
  ])("rejects a reused member code with different fields %j", async (patch) => {
    // Given
    const catalog = await createCatalog(app, scope)
    const headers = familyHeader(scope, "d")
    const body = { ...memberBody(catalog, "Original Child", `member-${scope}-d`), saveAsCommon: false }
    await request(app.getHttpServer()).post("/enrollment/members").set(headers).send(body).expect(201)
    // When
    const retry = await request(app.getHttpServer()).post("/enrollment/members").set(headers).send({ ...body, ...patch }).expect(409)
    // Then
    expect(retry.body.code).toBe("duplicate_business_key")
  })

  it("rejects a reused member code when its valid school placement differs", async () => {
    // Given
    const catalog = await createCatalog(app, scope)
    const headers = familyHeader(scope, "c")
    const body = memberBody(catalog, "Child", `member-${scope}-c`)
    await request(app.getHttpServer()).post("/enrollment/members").set(headers).send(body).expect(201)
    const schoolClass = await request(app.getHttpServer()).post(`/grades/${catalog.gradeId}/classes`).set(DEV_ADMIN_HEADERS)
      .send({ code: `class-${scope}-other`, name: "Other Class" }).expect(201)
    // When
    const retry = await request(app.getHttpServer()).post("/enrollment/members").set(headers).send({ ...body, classId: schoolClass.body.id }).expect(409)
    // Then
    expect(retry.body.code).toBe("duplicate_business_key")
  })

  it("keeps same-code members isolated between families", async () => {
    // Given
    const catalog = await createCatalog(app, scope)
    const body = memberBody(catalog, "Child", `member-${scope}-i`)
    const owner = await request(app.getHttpServer()).post("/enrollment/members").set(familyHeader(scope, "a")).send(body).expect(201)
    // When
    const other = await request(app.getHttpServer()).post("/enrollment/members").set(familyHeader(scope, "b")).send(body).expect(201)
    // Then
    expect(other.body.id).not.toBe(owner.body.id)
    await request(app.getHttpServer()).get(`/enrollment/members/${owner.body.id}`).set(familyHeader(scope, "b")).expect(404)
    await request(app.getHttpServer()).get(`/enrollment/members/${other.body.id}`).set(familyHeader(scope, "a")).expect(404)
  })
})
