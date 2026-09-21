import { DOMAIN_SCHEMA_VERSION, FAMILY_ENROLLMENT_AGREEMENT_VERSION } from "@linan/contracts"
import type { INestApplication, LoggerService } from "@nestjs/common"
import request from "supertest"
import { dataSource, DEV_ADMIN_HEADERS } from "./catalog-trip-fixture.js"

export const AGREEMENT_VERSION = FAMILY_ENROLLMENT_AGREEMENT_VERSION
const TEST_PERSON_DATA_KEY = Buffer.alloc(32, 11).toString("base64")

export type CatalogFixture = {
  readonly schoolId: string
  readonly gradeId: string
  readonly classId: string
  readonly tourSessionId: string
}

export type VirtualIdentityFixture = {
  readonly participantKind: "student" | "adult"
  readonly identityNumber: string
  readonly phone: string
}

type EnrollmentWindow = {
  readonly enrollmentOpensAt: string
  readonly enrollmentClosesAt: string
}

export async function createCatalog(
  app: INestApplication,
  scope: string,
  window: EnrollmentWindow = {
    enrollmentOpensAt: "2026-01-01T00:00:00.000Z",
    enrollmentClosesAt: "2027-01-01T00:00:00.000Z",
  },
): Promise<CatalogFixture> {
  const school = await request(app.getHttpServer())
    .post("/schools")
    .set(DEV_ADMIN_HEADERS)
    .send({ code: `school-${scope}`, name: "Enrollment School" })
    .expect(201)
  const grade = await request(app.getHttpServer())
    .post(`/schools/${school.body.id}/grades`)
    .set(DEV_ADMIN_HEADERS)
    .send({ code: `grade-${scope}`, name: "Grade One" })
    .expect(201)
  const schoolClass = await request(app.getHttpServer())
    .post(`/grades/${grade.body.id}/classes`)
    .set(DEV_ADMIN_HEADERS)
    .send({ code: `class-${scope}`, name: "Class One" })
    .expect(201)
  const catalog = await request(app.getHttpServer())
    .post("/catalog-items")
    .set(DEV_ADMIN_HEADERS)
    .send({
      organizationId: school.body.id,
      code: `catalog-${scope}`,
      title: "Enrollment Trip",
      status: "active",
    })
    .expect(201)
  const tourSession = await request(app.getHttpServer())
    .post("/tour-sessions")
    .set(DEV_ADMIN_HEADERS)
    .send({
      organizationId: school.body.id,
      catalogItemId: catalog.body.id,
      code: `session-${scope}`,
      status: "published",
      priceFen: 1200,
      capacity: 30,
      startsAt: "2027-02-01T00:00:00.000Z",
      endsAt: "2027-02-02T00:00:00.000Z",
      enrollmentOpensAt: window.enrollmentOpensAt,
      enrollmentClosesAt: window.enrollmentClosesAt,
    })
    .expect(201)

  return {
    schoolId: school.body.id,
    gradeId: grade.body.id,
    classId: schoolClass.body.id,
    tourSessionId: tourSession.body.id,
  }
}

export async function createMember(
  input: {
    readonly app: INestApplication
    readonly scope: string
    readonly headers: Record<string, string>
    readonly catalog: CatalogFixture
    readonly displayName: string
    readonly codeSuffix: string
    readonly body?: object
  },
): Promise<{ readonly id: string }> {
  process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"] ??= TEST_PERSON_DATA_KEY
  const member = await request(input.app.getHttpServer())
    .post("/enrollment/members")
    .set(input.headers)
    .send(input.body ?? memberBody(input.catalog, input.displayName, `member-${input.scope}-${input.codeSuffix}`))
    .expect(201)
  return { id: member.body.id }
}

export function memberBody(catalog: CatalogFixture, displayName: string, code = "member") {
  return {
    code,
    displayName,
    schoolId: catalog.schoolId,
    gradeId: catalog.gradeId,
    classId: catalog.classId,
    participantKind: "student",
    identityNumber: virtualResidentId("20100101", "003"),
    phone: virtualPhone("1000"),
  }
}

export function studentIdentityMemberBody(
  catalog: CatalogFixture,
  displayName: string,
  code: string,
  identity: VirtualIdentityFixture,
) {
  return {
    ...memberBody(catalog, displayName, code),
    participantKind: identity.participantKind,
    identityNumber: identity.identityNumber,
    phone: identity.phone,
  }
}

export function adultIdentityMemberBody(
  catalog: CatalogFixture,
  displayName: string,
  code: string,
  identity: VirtualIdentityFixture,
) {
  return {
    code,
    displayName,
    participantKind: identity.participantKind,
    identityNumber: identity.identityNumber,
    phone: identity.phone,
    tourSessionId: catalog.tourSessionId,
  }
}

export function enrollmentBody(input: {
  readonly catalog: CatalogFixture
  readonly memberIds: readonly string[]
  readonly contactName: string
  readonly emergencyContactName: string
  readonly emergencyContactPhone: string
  readonly withConsent?: boolean
}) {
  return {
    tourSessionId: input.catalog.tourSessionId,
    memberIds: input.memberIds,
    contactName: input.contactName,
    emergencyContactName: input.emergencyContactName,
    emergencyContactPhone: input.emergencyContactPhone,
    agreementVersion: input.withConsent === false ? undefined : AGREEMENT_VERSION,
    schemaVersion: input.withConsent === false ? undefined : DOMAIN_SCHEMA_VERSION,
  }
}

export function familyHeader(scope: string, family: string): Record<string, string> {
  return { "x-linan-dev-family-identity": `family-${scope}-${family}` }
}

export function restoreNodeEnv(previousNodeEnv: string | undefined): void {
  if (previousNodeEnv === undefined) {
    delete process.env["NODE_ENV"]
    return
  }
  process.env["NODE_ENV"] = previousNodeEnv
}

export function virtualResidentId(birthDate: string, sequence: string): string {
  const body = `999999${birthDate}${sequence}`
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2] as const
  const checkCodes = "10X98765432"
  let sum = 0
  for (const [index, weight] of weights.entries()) {
    sum += Number(body[index]) * weight
  }
  return `${body}${checkCodes[sum % 11]}`
}

export function virtualPhone(sequence: string): string {
  return `1990000${sequence.padStart(4, "0")}`
}

export function createCapturingLogger(messages: string[]): LoggerService {
  return {
    log: (message: unknown) => messages.push(String(message)),
    error: (message: unknown) => messages.push(String(message)),
    warn: (message: unknown) => messages.push(String(message)),
    debug: (message: unknown) => messages.push(String(message)),
    verbose: (message: unknown) => messages.push(String(message)),
  }
}

export async function resetEnrollmentConsentData(scope: string): Promise<void> {
  const familyPattern = `family-${scope}%`
  await dataSource.query(
    "delete from audit_logs where organization_id in (select id from organizations where code like ?)",
    [`school-${scope}%`],
  )
  await dataSource.query(
    "delete pe from payment_events pe join payments p on p.id = pe.payment_id join orders o on o.id = p.order_id join enrollments e on e.id = o.enrollment_id join families f on f.id = e.family_id where f.code like ?",
    [familyPattern],
  )
  await dataSource.query(
    "delete p from payments p join orders o on o.id = p.order_id join enrollments e on e.id = o.enrollment_id join families f on f.id = e.family_id where f.code like ?",
    [familyPattern],
  )
  await dataSource.query(
    "delete ol from order_lines ol join orders o on o.id = ol.order_id join enrollments e on e.id = o.enrollment_id join families f on f.id = e.family_id where f.code like ?",
    [familyPattern],
  )
  await dataSource.query(
    "delete o from orders o join enrollments e on e.id = o.enrollment_id join families f on f.id = e.family_id where f.code like ?",
    [familyPattern],
  )
  await dataSource.query(
    "delete r from roster_entries r join enrollments e on e.id = r.enrollment_id join families f on f.id = e.family_id where f.code like ?",
    [familyPattern],
  )
  await dataSource.query(
    "delete from consent_records where family_id in (select id from families where code like ?)",
    [familyPattern],
  )
  await dataSource.query(
    "delete from enrollment_participants where family_id in (select id from families where code like ?)",
    [familyPattern],
  )
  await dataSource.query(
    "delete from enrollments where family_id in (select id from families where code like ?)",
    [familyPattern],
  )
  await dataSource.query("delete from family_members where code like ?", [`member-${scope}%`])
  await dataSource.query("delete from families where code like ?", [`family-${scope}%`])
  await dataSource.query("delete from tour_sessions where code like ?", [`session-${scope}%`])
  await dataSource.query("delete from catalog_items where code like ?", [`catalog-${scope}%`])
  await dataSource.query("delete from school_classes where code like ?", [`class-${scope}%`])
  await dataSource.query("delete from school_grades where code like ?", [`grade-${scope}%`])
  await dataSource.query("delete from organizations where code like ?", [`school-${scope}%`])
}
