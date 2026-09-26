import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { closeCatalogTripDatabase, createCatalogTripApp, createScope, dataSource, databaseUrl, initializeCatalogTripDatabase } from "./catalog-trip-fixture.js"
import { createCatalog, enrollmentBody, familyHeader, memberBody, resetEnrollmentConsentData, restoreNodeEnv } from "./enrollment-consent-fixture.js"
import { createOrder } from "./mock-payment-fixture.js"
import { decryptPersonValue } from "../src/modules/enrollment/person-data.js"

describe.skipIf(databaseUrl === undefined)("Enrollment common participants", () => {
  let app: INestApplication
  let scope: string
  let previousNodeEnv: string | undefined
  let previousKey: string | undefined
  beforeAll(initializeCatalogTripDatabase)
  beforeEach(async () => {
    scope = createScope()
    previousNodeEnv = process.env["NODE_ENV"]
    previousKey = process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"]
    process.env["NODE_ENV"] = "development"
    process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"] = Buffer.alloc(32, 7).toString("base64")
    app = await createCatalogTripApp()
  })
  afterEach(async () => {
    await app.close()
    await resetEnrollmentConsentData(scope)
    restoreNodeEnv(previousNodeEnv)
    if (previousKey === undefined) delete process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"]
    else process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"] = previousKey
  })
  afterAll(closeCatalogTripDatabase)

  it("lists only consented common participants while retaining unsaved enrollment history and family isolation", async () => {
    // Given
    const catalog = await createCatalog(app, scope)
    const headers = familyHeader(scope, "owner")
    const saved = await request(app.getHttpServer()).post("/enrollment/members").set(headers)
      .send({ ...memberBody(catalog, "Saved Child", `member-${scope}-saved`), saveAsCommon: true }).expect(201)
    const once = await request(app.getHttpServer()).post("/enrollment/members").set(headers)
      .send({ ...memberBody(catalog, "Once Child", `member-${scope}-once`), saveAsCommon: false }).expect(201)
    const enrollment = await request(app.getHttpServer()).post("/enrollments").set(headers).send({
      ...enrollmentBody({ catalog, memberIds: [once.body.id], contactName: "Parent", emergencyContactName: "Emergency", emergencyContactPhone: "19900001111" }),
      contactPhone: "19900002222",
    }).expect(201)
    const order = await createOrder(app, { headers, enrollmentId: enrollment.body.id, tourSessionId: catalog.tourSessionId, participantIds: [] }, `order-${scope}-once`)
    // When
    const listed = await request(app.getHttpServer()).get("/enrollment/members").set(headers).expect(200)
    const historic = await request(app.getHttpServer()).get(`/enrollment/members/${once.body.id}`).set(headers).expect(200)
    // Then
    expect(listed.body).toEqual([expect.objectContaining({ id: saved.body.id })])
    expect(historic.body.id).toBe(once.body.id)
    await request(app.getHttpServer()).get(`/orders/${order.id}`).set(headers).expect(200)
    await request(app.getHttpServer()).get(`/orders/${order.id}`).set(familyHeader(scope, "other")).expect(404)
    await request(app.getHttpServer()).get(`/enrollment/members/${once.body.id}`).set(familyHeader(scope, "other")).expect(404)
    await request(app.getHttpServer()).delete(`/enrollment/members/${once.body.id}`).set(headers).expect(409)
    const rows: readonly { contact_phone: string; family_member_id: string }[] = await dataSource.query(
      "SELECT e.contact_phone, p.family_member_id FROM enrollments e JOIN enrollment_participants p ON p.enrollment_id = e.id WHERE e.id = ?", [enrollment.body.id])
    expect(rows).toEqual([{ contact_phone: "19900002222", family_member_id: once.body.id }])
  })

  it("snapshots the current parent contact for a saved child without rewriting prior enrollment phone", async () => {
    // Given
    const catalog = await createCatalog(app, scope)
    const headers = familyHeader(scope, "contact")
    const child = await request(app.getHttpServer()).post("/enrollment/members").set(headers)
      .send({ ...memberBody(catalog, "Child", `member-${scope}-contact`), phone: "19900001111", saveAsCommon: true }).expect(201)
    const body = enrollmentBody({ catalog, memberIds: [child.body.id], contactName: "Parent", emergencyContactName: "Emergency", emergencyContactPhone: "19900001111" })
    const first = await request(app.getHttpServer()).post("/enrollments").set(headers).send({ ...body, contactPhone: "19900002222" }).expect(201)
    // When
    const second = await request(app.getHttpServer()).post("/enrollments").set(headers).send({ ...body, contactPhone: "19900003333" }).expect(201)
    // Then
    for (const [id, expected] of [[first.body.id, "19900002222"], [second.body.id, "19900003333"]]) {
      const rows: readonly { phone: string; version: string }[] = await dataSource.query(
        "SELECT phone_ciphertext_snapshot AS phone, person_data_key_version_snapshot AS version FROM enrollment_participants WHERE enrollment_id = ?", [id])
      expect(rows).toHaveLength(1)
      for (const row of rows) expect(decryptPersonValue(row.phone, row.version)).toBe(expected)
    }
    const existing = await request(app.getHttpServer()).get(`/enrollment/members/${child.body.id}`).set(headers).expect(200)
    expect(existing.body.phoneMasked).toBe("199****1111")
  })
})
