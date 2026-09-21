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
  DEV_ADMIN_HEADERS,
  initializeCatalogTripDatabase,
} from "./catalog-trip-fixture.js"
import {
  AGREEMENT_VERSION,
  adultIdentityMemberBody,
  createCapturingLogger,
  createCatalog,
  createDemoNotice,
  createMember,
  demoNoticeContent,
  enrollmentBody,
  familyHeader,
  memberBody,
  resetEnrollmentConsentData,
  restoreNodeEnv,
  studentIdentityMemberBody,
  virtualPhone,
  virtualResidentId,
} from "./enrollment-consent-fixture.js"
import { createOrder } from "./mock-payment-fixture.js"

const PERSON_DATA_KEY = Buffer.alloc(32, 7).toString("base64")

describe.skipIf(databaseUrl === undefined)("Enrollment consent API", () => {
  let app: INestApplication
  let capturedLogs: string[]
  let scope: string
  let previousPersonDataKey: string | undefined
  let previousSuiteNodeEnv: string | undefined

  beforeAll(async () => {
    await initializeCatalogTripDatabase()
  })

  beforeEach(async () => {
    scope = createScope()
    capturedLogs = []
    previousSuiteNodeEnv = process.env["NODE_ENV"]
    process.env["NODE_ENV"] = "development"
    previousPersonDataKey = process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"]
    process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"] = PERSON_DATA_KEY
    app = await createCatalogTripApp()
    app.useLogger(createCapturingLogger(capturedLogs))
  })

  afterEach(async () => {
    restorePersonDataKey(previousPersonDataKey)
    restoreNodeEnv(previousSuiteNodeEnv)
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
        emergencyContactPhone: virtualPhone("0001"),
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
        noticeVersionId: catalog.noticeVersionId,
        noticeVersion: catalog.noticeVersion,
      }),
    )
    await expect(
      dataSource.query(
        "select purpose, agreement_version, schema_version, notice_version_id, notice_version from consent_records where subject_id = ?",
        [enrollment.body.id],
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        purpose: "enrollment_submission",
        agreement_version: AGREEMENT_VERSION,
        schema_version: DOMAIN_SCHEMA_VERSION,
        notice_version_id: catalog.noticeVersionId,
        notice_version: catalog.noticeVersion,
      }),
    ])
  })


  it("creates immutable notice versions, activates history, and rejects non-demo notice seed", async () => {
    // Given
    const catalog = await createCatalog(app, scope)
    const v2 = await request(app.getHttpServer())
      .post(`/tour-sessions/${catalog.tourSessionId}/notices`)
      .set(DEV_ADMIN_HEADERS)
      .send({
        version: "v2",
        title: "[演示]大明山地质研学告家长书 v2",
        contentJson: { ...demoNoticeContent(), mealNote: "[演示]第二版研学简餐说明。" },
      })
      .expect(201)

    // When
    const activated = await request(app.getHttpServer())
      .post(`/tour-sessions/${catalog.tourSessionId}/notices/${v2.body.id}/activate`)
      .set(DEV_ADMIN_HEADERS)
      .expect(201)
    const notices = await request(app.getHttpServer())
      .get(`/tour-sessions/${catalog.tourSessionId}/notices`)
      .expect(200)
    const liveSeed = await request(app.getHttpServer())
      .post(`/tour-sessions/${catalog.tourSessionId}/notices`)
      .set(DEV_ADMIN_HEADERS)
      .send({
        version: "live-v1",
        title: "真实团期告知书",
        contentJson: { ...demoNoticeContent(), destination: "真实目的地" },
      })
      .expect(400)

    // Then
    expect(activated.body).toEqual(expect.objectContaining({ activeNoticeId: v2.body.id }))
    expect(notices.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: catalog.noticeVersionId, version: "v1", contentJson: expect.objectContaining({ mealNote: "[演示]含研学简餐，过敏情况请提前备注。" }) }),
      expect.objectContaining({ id: v2.body.id, version: "v2", contentJson: expect.objectContaining({ mealNote: "[演示]第二版研学简餐说明。" }) }),
    ]))
    expect(liveSeed.body).toEqual(expect.objectContaining({ code: "malformed_input" }))
  })

  it("rejects enrollment without an active notice or with a stale notice version", async () => {
    // Given
    const noNoticeScope = `${scope.slice(0, 36)}-nn`
    const staleScope = `${scope.slice(0, 36)}-st`
    const noNoticeCatalog = await createCatalog(app, noNoticeScope, {
      enrollmentOpensAt: "2026-01-01T00:00:00.000Z",
      enrollmentClosesAt: "2027-01-01T00:00:00.000Z",
      withNotice: false,
    })
    const noNoticeMember = await createMember({
      app,
      scope: noNoticeScope,
      headers: familyHeader(noNoticeScope, "n"),
      catalog: noNoticeCatalog,
      displayName: "No Notice Child",
      codeSuffix: "n",
    })
    const staleCatalog = await createCatalog(app, staleScope)
    const staleMember = await createMember({
      app,
      scope: staleScope,
      headers: familyHeader(staleScope, "s"),
      catalog: staleCatalog,
      displayName: "Stale Notice Child",
      codeSuffix: "s",
    })
    const oldNotice = { id: staleCatalog.noticeVersionId, version: staleCatalog.noticeVersion }
    await createDemoNotice(app, staleCatalog.tourSessionId, "v2")

    // When
    const noActive = await request(app.getHttpServer())
      .post("/enrollments")
      .set(familyHeader(noNoticeScope, "n"))
      .send(enrollmentBody({
        catalog: noNoticeCatalog,
        memberIds: [noNoticeMember.id],
        contactName: "No Notice Parent",
        emergencyContactName: "No Notice Emergency",
        emergencyContactPhone: virtualPhone("2001"),
      }))
      .expect(400)
    const stale = await request(app.getHttpServer())
      .post("/enrollments")
      .set(familyHeader(staleScope, "s"))
      .send({
        ...enrollmentBody({
          catalog: staleCatalog,
          memberIds: [staleMember.id],
          contactName: "Stale Parent",
          emergencyContactName: "Stale Emergency",
          emergencyContactPhone: virtualPhone("2002"),
        }),
        noticeVersionId: oldNotice.id,
        noticeVersion: oldNotice.version,
      })
      .expect(400)

    // Then
    expect(noActive.body).toEqual(expect.objectContaining({ code: "stale_state" }))
    expect(stale.body).toEqual(expect.objectContaining({ code: "stale_state" }))
    await resetEnrollmentConsentData(noNoticeScope)
    await resetEnrollmentConsentData(staleScope)
  }, 20_000)


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
        emergencyContactPhone: virtualPhone("0002"),
      }))
      .expect(201)

    // Then
    expect(enrollment.body).toEqual(expect.objectContaining({ memberIds: [member.id], participantCount: 1 }))
  })

  it("stores virtual adult and student identity data encrypted while keeping per-person order totals", async () => {
    // Given
    const catalog = await createCatalog(app, scope)
    await dataSource.query("update tour_sessions set price_fen = ? where id = ?", [19_500, catalog.tourSessionId])
    const headers = familyHeader(scope, "id")
    const studentIdentityNumber = virtualResidentId("20100101", "003")
    const adultIdentityNumber = virtualResidentId("19800101", "005")
    const student = await request(app.getHttpServer())
      .post("/enrollment/members")
      .set(headers)
      .send(studentIdentityMemberBody(catalog, "Virtual Student", `member-${scope}-student`, {
        participantKind: "student",
        identityNumber: studentIdentityNumber,
        phone: virtualPhone("1001"),
      }))
      .expect(201)
    const adult = await request(app.getHttpServer())
      .post("/enrollment/members")
      .set(headers)
      .send(adultIdentityMemberBody(catalog, "Virtual Guardian", `member-${scope}-adult`, {
        participantKind: "adult",
        identityNumber: adultIdentityNumber,
        phone: virtualPhone("1002"),
      }))
      .expect(201)

    // When
    const enrollment = await request(app.getHttpServer())
      .post("/enrollments")
      .set(headers)
      .send(enrollmentBody({
        catalog,
        memberIds: [student.body.id, adult.body.id],
        contactName: "Virtual Parent",
        emergencyContactName: "Virtual Emergency",
        emergencyContactPhone: virtualPhone("1003"),
      }))
      .expect(201)
    const order = await createOrder(app, {
      headers,
      enrollmentId: enrollment.body.id,
      tourSessionId: catalog.tourSessionId,
      participantIds: [],
    }, `order-${scope}-identity`)

    // Then
    expect(student.body).toEqual(expect.objectContaining({
      participantKind: "student",
      identityNumberMasked: maskIdentityNumber(studentIdentityNumber),
      phoneMasked: "199****1001",
    }))
    expect(adult.body).toEqual(expect.objectContaining({
      participantKind: "adult",
      gradeId: null,
      classId: null,
      identityNumberMasked: maskIdentityNumber(adultIdentityNumber),
      phoneMasked: "199****1002",
    }))
    expect(enrollment.body).toEqual(expect.objectContaining({ participantCount: 2 }))
    expect(order.amountFen).toBe(39_000)
    const orderLines: readonly {
      readonly amount_fen: number
      readonly participant_kind_snapshot: string
    }[] = await dataSource.query(
      "select participant_kind_snapshot, amount_fen from order_lines where order_id = ? order by participant_kind_snapshot",
      [order.id],
    )
    expect(orderLines).toEqual([
      { participant_kind_snapshot: "adult", amount_fen: 19_500 },
      { participant_kind_snapshot: "student", amount_fen: 19_500 },
    ])
    const stored: readonly {
      readonly identity_ciphertext: string | null
      readonly identity_hash: string | null
      readonly identity_masked: string | null
      readonly participant_kind: string
    }[] = await dataSource.query(
      "select participant_kind, identity_ciphertext, identity_hash, identity_masked from family_members where code in (?, ?) order by code",
      [`member-${scope}-adult`, `member-${scope}-student`],
    )
    expect(stored).toHaveLength(2)
    expect(stored.every((row) => row.identity_ciphertext !== null && row.identity_hash !== null)).toBe(true)
    expect(JSON.stringify(stored)).not.toContain(studentIdentityNumber)
    expect(JSON.stringify(stored)).not.toContain(adultIdentityNumber)
    expect(capturedLogs.join("\n")).not.toContain(studentIdentityNumber)
  })

  it("rejects malformed identity data and missing encryption key with typed errors", async () => {
    // Given
    const catalog = await createCatalog(app, scope)
    const headers = familyHeader(scope, "bad")
    const validIdentityNumber = virtualResidentId("20100101", "007")
    const badChecksumIdentityNumber = `${validIdentityNumber.slice(0, 17)}${validIdentityNumber.endsWith("X") ? "0" : "X"}`

    // When
    const badChecksum = await request(app.getHttpServer())
      .post("/enrollment/members")
      .set(headers)
      .send(studentIdentityMemberBody(catalog, "Bad Checksum", `member-${scope}-bad-checksum`, {
        participantKind: "student",
        identityNumber: badChecksumIdentityNumber,
        phone: virtualPhone("1004"),
      }))
      .expect(400)
    const badPhone = await request(app.getHttpServer())
      .post("/enrollment/members")
      .set(headers)
      .send(studentIdentityMemberBody(catalog, "Bad Phone", `member-${scope}-bad-phone`, {
        participantKind: "student",
        identityNumber: validIdentityNumber,
        phone: "100",
      }))
      .expect(400)
    delete process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"]
    const missingKey = await request(app.getHttpServer())
      .post("/enrollment/members")
      .set(headers)
      .send(studentIdentityMemberBody(catalog, "Missing Key", `member-${scope}-missing-key`, {
        participantKind: "student",
        identityNumber: validIdentityNumber,
        phone: virtualPhone("1005"),
      }))
      .expect(400)

    // Then
    expect(badChecksum.body).toEqual(expect.objectContaining({ code: "malformed_input" }))
    expect(badPhone.body).toEqual(expect.objectContaining({ code: "malformed_input" }))
    expect(missingKey.body).toEqual(expect.objectContaining({ code: "malformed_input" }))
  })

  it("rejects new members without protected identity fields or adult school placement", async () => {
    // Given
    const catalog = await createCatalog(app, scope)
    const headers = familyHeader(scope, "req")
    const adultIdentityNumber = virtualResidentId("19800101", "009")

    // When
    const missingIdentity = await request(app.getHttpServer())
      .post("/enrollment/members")
      .set(headers)
      .send({
        code: `member-${scope}-missing-identity`,
        displayName: "Missing Identity",
        participantKind: "student",
        schoolId: catalog.schoolId,
        gradeId: catalog.gradeId,
        classId: catalog.classId,
        phone: virtualPhone("1006"),
      })
      .expect(400)
    const missingPhone = await request(app.getHttpServer())
      .post("/enrollment/members")
      .set(headers)
      .send({
        code: `member-${scope}-missing-phone`,
        displayName: "Missing Phone",
        participantKind: "student",
        schoolId: catalog.schoolId,
        gradeId: catalog.gradeId,
        classId: catalog.classId,
        identityNumber: adultIdentityNumber,
      })
      .expect(400)
    const adultWithClass = await request(app.getHttpServer())
      .post("/enrollment/members")
      .set(headers)
      .send({
        code: `member-${scope}-adult-class`,
        displayName: "Adult With Class",
        participantKind: "adult",
        schoolId: catalog.schoolId,
        gradeId: catalog.gradeId,
        classId: catalog.classId,
        tourSessionId: catalog.tourSessionId,
        identityNumber: adultIdentityNumber,
        phone: virtualPhone("1007"),
      })
      .expect(400)

    // Then
    expect(missingIdentity.body).toEqual(expect.objectContaining({ code: "malformed_input" }))
    expect(missingPhone.body).toEqual(expect.objectContaining({ code: "malformed_input" }))
    expect(adultWithClass.body).toEqual(expect.objectContaining({ code: "malformed_input" }))
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
        emergencyContactPhone: virtualPhone("0003"),
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
          emergencyContactPhone: virtualPhone("0003"),
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
        emergencyContactPhone: virtualPhone("0006"),
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
    const sensitivePhone = virtualPhone("0004")
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
        emergencyContactPhone: virtualPhone("0005"),
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

function restorePersonDataKey(value: string | undefined): void {
  if (value === undefined) {
    delete process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"]
    return
  }
  process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"] = value
}

function maskIdentityNumber(value: string): string {
  return `${value.slice(0, 6)}********${value.slice(-4)}`
}
