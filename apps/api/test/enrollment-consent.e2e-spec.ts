import { DOMAIN_SCHEMA_VERSION } from "@linan/contracts"
import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  closeCatalogTripDatabase,
  createCatalogTripApp,
  createScope,
  dataSource,
  databaseUrl,
  initializeCatalogTripDatabase,
} from "./catalog-trip-fixture.js"
import {
  AGREEMENT_VERSION,
  createCapturingLogger,
  createCatalog,
  createMember,
  enrollmentBody,
  familyHeader,
  memberBody,
  resetEnrollmentConsentData,
  restoreNodeEnv,
} from "./enrollment-consent-fixture.js"

describe.skipIf(databaseUrl === undefined)("Enrollment consent API", () => {
  let app: INestApplication
  let capturedLogs: string[]
  let scope: string

  beforeAll(async () => {
    await initializeCatalogTripDatabase()
  })

  beforeEach(async () => {
    scope = createScope()
    capturedLogs = []
    app = await createCatalogTripApp()
    app.useLogger(createCapturingLogger(capturedLogs))
  })

  afterEach(async () => {
    await app.close()
    await resetEnrollmentConsentData(scope)
  })

  afterAll(async () => {
    await closeCatalogTripDatabase()
  })

  it("submits one enrollment for two fictitious children when consent versions are present", async () => {
    // Given
    const catalog = await createCatalog(app, scope)
    const firstMember = await createMember({
      app,
      scope,
      headers: familyHeader(scope, "a"),
      catalog,
      displayName: "Lin An Child A",
      codeSuffix: "a",
    })
    const secondMember = await createMember({
      app,
      scope,
      headers: familyHeader(scope, "a"),
      catalog,
      displayName: "Lin An Child B",
      codeSuffix: "b",
    })

    // When
    const enrollment = await request(app.getHttpServer())
      .post("/enrollments")
      .set(familyHeader(scope, "a"))
      .send(enrollmentBody({
        catalog,
        memberIds: [firstMember.id, secondMember.id],
        contactName: "Parent A",
        emergencyContactName: "Emergency A",
        emergencyContactPhone: "13900000001",
      }))
      .expect(201)

    // Then
    expect(enrollment.body).toEqual(
      expect.objectContaining({
        tourSessionId: catalog.tourSessionId,
        memberIds: [firstMember.id, secondMember.id],
        participantCount: 2,
        status: "pending",
        policyVersion: expect.any(String),
        agreementVersion: AGREEMENT_VERSION,
        schemaVersion: DOMAIN_SCHEMA_VERSION,
      }),
    )
    await expect(
      dataSource.query(
        "select purpose, agreement_version, schema_version from consent_records where subject_id = ?",
        [enrollment.body.id],
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        purpose: "enrollment_submission",
        agreement_version: AGREEMENT_VERSION,
        schema_version: DOMAIN_SCHEMA_VERSION,
      }),
    ])
  })

  it("submits one enrollment for a single child", async () => {
    // Given
    const catalog = await createCatalog(app, scope)
    const member = await createMember({
      app,
      scope,
      headers: familyHeader(scope, "s"),
      catalog,
      displayName: "Lin An Only Child",
      codeSuffix: "s",
    })

    // When
    const enrollment = await request(app.getHttpServer())
      .post("/enrollments")
      .set(familyHeader(scope, "s"))
      .send(enrollmentBody({
        catalog,
        memberIds: [member.id],
        contactName: "Parent Single",
        emergencyContactName: "Emergency Single",
        emergencyContactPhone: "13900000002",
      }))
      .expect(201)

    // Then
    expect(enrollment.body).toEqual(expect.objectContaining({ memberIds: [member.id], participantCount: 1 }))
  })

  it("rejects enrollment submission when consent versions are missing or unsupported", async () => {
    // Given
    const catalog = await createCatalog(app, scope)
    const member = await createMember({
      app,
      scope,
      headers: familyHeader(scope, "m"),
      catalog,
      displayName: "Consent Child",
      codeSuffix: "m",
    })

    // When
    const enrollment = await request(app.getHttpServer())
      .post("/enrollments")
      .set(familyHeader(scope, "m"))
      .send(enrollmentBody({
        catalog,
        memberIds: [member.id],
        contactName: "Parent Missing",
        emergencyContactName: "Emergency Missing",
        emergencyContactPhone: "13900000003",
        withConsent: false,
      }))
      .expect(400)

    // Then
    expect(enrollment.body).toEqual(expect.objectContaining({ code: "malformed_input" }))

    await request(app.getHttpServer())
      .post("/enrollments")
      .set(familyHeader(scope, "m"))
      .send({
        ...enrollmentBody({
          catalog,
          memberIds: [member.id],
          contactName: "Parent Missing",
          emergencyContactName: "Emergency Missing",
          emergencyContactPhone: "13900000003",
        }),
        agreementVersion: "unsupported-agreement-v0",
      })
      .expect(400)
  })

  it("rejects duplicate family members", async () => {
    // Given
    const catalog = await createCatalog(app, scope)
    await createMember({
      app,
      scope,
      headers: familyHeader(scope, "d"),
      catalog,
      displayName: "Duplicate Child",
      codeSuffix: "d",
    })

    // When
    const duplicate = await request(app.getHttpServer())
      .post("/enrollment/members")
      .set(familyHeader(scope, "d"))
      .send(memberBody(catalog, "Duplicate Child", `member-${scope}-d`))
      .expect(409)

    // Then
    expect(duplicate.body).toEqual(expect.objectContaining({ code: "duplicate_business_key" }))
  })

  it("lists, updates, and protects deletion of members already used by an enrollment", async () => {
    // Given
    const catalog = await createCatalog(app, scope)
    const headers = familyHeader(scope, "c")
    const member = await createMember({ app, scope, headers, catalog, displayName: "Crud Child", codeSuffix: "c" })

    // When
    await request(app.getHttpServer())
      .patch(`/enrollment/members/${member.id}`)
      .set(headers)
      .send({ displayName: "Crud Child Updated" })
      .expect(200)
    const members = await request(app.getHttpServer()).get("/enrollment/members").set(headers).expect(200)
    await request(app.getHttpServer())
      .post("/enrollments")
      .set(headers)
      .send(enrollmentBody({
        catalog,
        memberIds: [member.id],
        contactName: "Crud Parent",
        emergencyContactName: "Crud Emergency",
        emergencyContactPhone: "13900000006",
      }))
      .expect(201)
    const deletion = await request(app.getHttpServer()).delete(`/enrollment/members/${member.id}`).set(headers).expect(409)

    // Then
    expect(members.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: member.id, displayName: "Crud Child Updated" })]),
    )
    expect(deletion.body).toEqual(expect.objectContaining({ code: "referenced_business_record" }))
  })

  it("rejects member access across families without exposing sensitive values", async () => {
    // Given
    const catalog = await createCatalog(app, scope)
    const sensitiveName = "Sensitive Child"
    const sensitivePhone = "13900000004"
    const member = await createMember({
      app,
      scope,
      headers: familyHeader(scope, "o"),
      catalog,
      displayName: sensitiveName,
      codeSuffix: "o",
    })

    // When
    const forbidden = await request(app.getHttpServer())
      .post("/enrollments")
      .set(familyHeader(scope, "x"))
      .send(enrollmentBody({
        catalog,
        memberIds: [member.id],
        contactName: "Other Parent",
        emergencyContactName: "Other Emergency",
        emergencyContactPhone: sensitivePhone,
      }))
      .expect(404)

    // Then
    expect(JSON.stringify(forbidden.body)).not.toContain(sensitiveName)
    expect(JSON.stringify(forbidden.body)).not.toContain(sensitivePhone)
    expect(capturedLogs.join("\n")).not.toContain(sensitiveName)
    expect(capturedLogs.join("\n")).not.toContain(sensitivePhone)
  })

  it("rejects enrollment when the tour session availability window is closed", async () => {
    // Given
    const catalog = await createCatalog(app, scope, {
      enrollmentOpensAt: "2025-01-01T00:00:00.000Z",
      enrollmentClosesAt: "2025-01-02T00:00:00.000Z",
    })
    const member = await createMember({
      app,
      scope,
      headers: familyHeader(scope, "cl"),
      catalog,
      displayName: "Closed Child",
      codeSuffix: "cl",
    })

    // When
    const enrollment = await request(app.getHttpServer())
      .post("/enrollments")
      .set(familyHeader(scope, "cl"))
      .send(enrollmentBody({
        catalog,
        memberIds: [member.id],
        contactName: "Parent Closed",
        emergencyContactName: "Emergency Closed",
        emergencyContactPhone: "13900000005",
      }))
      .expect(400)

    // Then
    expect(enrollment.body).toEqual(expect.objectContaining({ code: "stale_state" }))
  })

  it("rejects the development family header in production mode", async () => {
    // Given
    const previousNodeEnv = process.env["NODE_ENV"]
    process.env["NODE_ENV"] = "production"

    try {
      // When
      const response = await request(app.getHttpServer()).get("/enrollment/members").set(familyHeader(scope, "prod")).expect(401)

      // Then
      expect(response.body).toEqual(expect.objectContaining({ code: "identity_unavailable" }))
    } finally {
      restoreNodeEnv(previousNodeEnv)
    }
  })
})
