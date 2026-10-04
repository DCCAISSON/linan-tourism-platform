import { randomUUID } from "node:crypto"
import { Readable } from "node:stream"
import ExcelJS from "exceljs"
import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { dataSource } from "./catalog-trip-fixture.js"
import { adultIdentityMemberBody, createCatalog, createMember, enrollmentBody, familyHeader, studentIdentityMemberBody, virtualPhone, virtualResidentId } from "./enrollment-consent-fixture.js"
import { collectBinary } from "./roster-export-fixture.js"
import { createOrder, mockEventBody, startMockPayment } from "./mock-payment-fixture.js"
import { hashStaffPassword } from "../src/modules/iam/staff-password.js"
import { STAFF_PERMISSION_KEYS, type StaffPermissionKey, type StaffScope } from "../src/modules/iam/staff-permissions.js"

export const CONTINUATION_ORIGIN = "http://127.0.0.1:5174"
export type ContinuationActor = { readonly id: string; readonly username: string; readonly password: string; readonly cookie: string }
export type ContinuationCatalog = Awaited<ReturnType<typeof createCatalog>>

export async function createContinuationActor(app: INestApplication, scope: string, name: string, permissions: readonly StaffPermissionKey[], access: StaffScope): Promise<ContinuationActor> {
  const id = `staff-${scope}-${name}`
  const password = `QA1${randomUUID()}`
  await dataSource.query("insert into staff_accounts(id,username,display_name,password_hash,status,force_password_change,failed_login_attempts,permissions_version) values(?,?,?,?, 'active',false,0,1)", [id, id, `验收${name}`, await hashStaffPassword(password)])
  for (const [index, key] of permissions.entries()) await dataSource.query("insert into staff_account_permissions(id,staff_account_id,permission_key) values(?,?,?)", [`${id}-p${index}`, id, key])
  await dataSource.query("insert into staff_account_scopes(id,staff_account_id,scope_kind,scope_id) values(?,?,?,?)", [`${id}-s`, id, access.kind, access.id])
  const login = await request(app.getHttpServer()).post("/staff/auth/login").set("Origin", CONTINUATION_ORIGIN).send({ username: id, password }).expect(200)
  const setCookie: unknown = login.headers["set-cookie"]
  const rawCookie: unknown = Array.isArray(setCookie) ? setCookie[0] : setCookie
  if (typeof rawCookie !== "string") throw new Error("Isolated staff login did not issue a cookie")
  return { id, username: id, password, cookie: rawCookie.split(";")[0] ?? "" }
}

export function continuationHeaders(actor: ContinuationActor): Record<string, string> {
  return { Cookie: actor.cookie, Origin: CONTINUATION_ORIGIN }
}

async function paidFamily(app: INestApplication, scope: string, catalog: ContinuationCatalog, family: string, adults: boolean) {
  const headers = familyHeader(scope, family)
  const people = adults ? [{ name: "联调学生甲", kind: "student" as const, sequence: "971" }, { name: "联调家长甲", kind: "adult" as const, sequence: "972" }] : [{ name: "联调学生乙", kind: "student" as const, sequence: "973" }]
  const memberIds: string[] = []
  for (const person of people) {
    const identity = { participantKind: person.kind, identityNumber: virtualResidentId(person.kind === "adult" ? "19860101" : "20160101", person.sequence), phone: virtualPhone(person.sequence) }
    const code = `member-${scope}-${person.sequence}`
    const body = person.kind === "adult" ? adultIdentityMemberBody(catalog, person.name, code, identity) : studentIdentityMemberBody(catalog, person.name, code, identity)
    memberIds.push((await createMember({ app, scope, headers, catalog, displayName: person.name, codeSuffix: person.sequence, body })).id)
  }
  const enrollment = await request(app.getHttpServer()).post("/enrollments").set(headers).send(enrollmentBody({ catalog, memberIds, contactName: "联调联系人", emergencyContactName: "联调紧急联系人", emergencyContactPhone: virtualPhone("0974") })).expect(201)
  const fixture = { headers, enrollmentId: String(enrollment.body.id), tourSessionId: catalog.tourSessionId, participantIds: [] }
  const order = await createOrder(app, fixture, `${scope}-${family}`)
  const payment = await startMockPayment(app, fixture, order.id)
  await request(app.getHttpServer()).post("/payments/mock/events").set(headers).send(mockEventBody({ eventId: `${scope}-${family}-event`, orderId: order.id, transactionId: `${scope}-${family}-tx`, amountFen: payment.amountFen, status: "succeeded" })).expect(201)
  const rows: { id: string; participant_kind: string }[] = await dataSource.query("select id,participant_kind_snapshot as participant_kind from order_lines where order_id=? order by participant_kind_snapshot", [order.id])
  return { orderId: order.id, headers, lines: rows.map(row => ({ lineId: row.id, personRef: `paid:${row.id}`, kind: row.participant_kind })) }
}

async function importPerson(app: INestApplication, actor: ContinuationActor, scope: string, catalog: ContinuationCatalog, template: "teacher" | "grade_3_6", sequence: string) {
  const downloaded = await request(app.getHttpServer()).get(`/roster/templates/${template}.xlsx`).set(continuationHeaders(actor)).buffer(true).parse(collectBinary).expect(200)
  if (!Buffer.isBuffer(downloaded.body)) throw new Error("Expected downloaded original workbook")
  const book = new ExcelJS.Workbook()
  await book.xlsx.read(Readable.from(downloaded.body))
  const sheet = book.getWorksheet("数据导入项")
  if (!sheet) throw new Error("Original import sheet missing")
  sheet.getCell("B3").value = "Class One"
  sheet.getCell("C3").value = template === "teacher" ? "联调教师" : "联调导入学生"
  sheet.getCell("D3").value = virtualResidentId(template === "teacher" ? "19860101" : "20160101", sequence)
  sheet.getCell("G3").value = virtualPhone(sequence)
  const imported = await request(app.getHttpServer()).post("/roster/imports").set(continuationHeaders(actor)).field("template", template).field("tourSessionId", catalog.tourSessionId).field("schoolId", catalog.schoolId).field("gradeId", catalog.gradeId).field("classId", catalog.classId).attach("file", Buffer.from(await book.xlsx.writeBuffer()), `${scope}-${template}.xlsx`).expect(201)
  if (imported.body.importedCount !== 1) throw new Error("Expected one synthetic imported person")
}

export async function createContinuationFixture(app: INestApplication) {
  const scope = `bc-${randomUUID().slice(0, 8)}`
  const catalog = await createCatalog(app, scope)
  const unrelated = await createCatalog(app, `${scope}-x`)
  const admin = await createContinuationActor(app, scope, "admin", STAFF_PERMISSION_KEYS, { kind: "all", id: null })
  const manager = await createContinuationActor(app, scope, "manager", ["execution.read", "execution.manage", "execution.publish"], { kind: "tour_session", id: catalog.tourSessionId })
  const school = await createContinuationActor(app, scope, "school", ["pretrip.read", "pretrip.school_confirm", "transport.read"], { kind: "school", id: catalog.schoolId })
  const guidePermissions: readonly StaffPermissionKey[] = ["execution.read", "execution.write"]
  const guideOne = await createContinuationActor(app, scope, "guide1", guidePermissions, { kind: "tour_session", id: catalog.tourSessionId })
  const guideTwo = await createContinuationActor(app, scope, "guide2", guidePermissions, { kind: "tour_session", id: catalog.tourSessionId })
  const familyA = await paidFamily(app, scope, catalog, "a", true)
  const familyB = await paidFamily(app, scope, catalog, "b", false)
  await importPerson(app, admin, scope, catalog, "teacher", "974")
  await importPerson(app, admin, scope, catalog, "grade_3_6", "975")
  const importedRoster = await request(app.getHttpServer()).get(`/travelers/sessions/${catalog.tourSessionId}`).set(continuationHeaders(admin)).query({ classId: catalog.classId, includeInactive: "true", pageSize: "100" }).expect(200)
  const importedPeople: { personRef: string; importedRole: string | null; importVersion: number | null }[] = importedRoster.body.travelers
  const pendingStudent = importedPeople.find(person => person.personRef.startsWith("imported:") && person.importedRole === "student")
  if (!pendingStudent) throw new Error("Imported student source missing")
  const eligibility = await request(app.getHttpServer()).post(`/travelers/imports/${encodeURIComponent(pendingStudent.personRef.slice("imported:".length))}/confirm`).set(continuationHeaders(admin)).send({ expectedVersion: pendingStudent.importVersion, expectedRosterVersion: importedRoster.body.rosterVersion, reason: "隔离导入学生出行资格确认" })
  if (eligibility.status !== 201) throw new Error(`Import eligibility: ${eligibility.status} ${String(eligibility.body.code)} ${String(eligibility.body.message)}`)
  const vehicleInput = [1, 2].map(sequence => ({ sequence, seatCapacity: 3, plateNumber: `浙A联调0${sequence}`, contactSnapshot: { driverName: "联调司机", driverPhone: virtualPhone("0976"), guideName: `导游${sequence}`, guidePhone: virtualPhone(`097${sequence}`), teacherName: `随车教师${sequence}`, teacherPhone: virtualPhone(`098${sequence}`) }, allocations: [{ classId: catalog.classId, studentCount: sequence === 1 ? 1 : 2, guardianCount: sequence === 1 ? 1 : 0, teacherCount: sequence === 1 ? 1 : 0, otherCount: 0, note: "" }] }))
  const saved = await request(app.getHttpServer()).put(`/transport/sessions/${catalog.tourSessionId}/plan`).set(continuationHeaders(admin)).send({ vehicles: vehicleInput }).expect(200)
  const vehicles: { id: string; sequence: number }[] = saved.body.vehicles
  const people = await request(app.getHttpServer()).get(`/transport/sessions/${catalog.tourSessionId}/people-plan`).set(continuationHeaders(admin)).expect(200)
  const candidates: { personRef: string; importedRole: string | null }[] = people.body.unassigned
  const teacher = candidates.find(person => person.personRef.startsWith("imported:") && person.importedRole === "teacher")?.personRef
  const importedStudent = candidates.find(person => person.personRef.startsWith("imported:") && person.importedRole === "student")?.personRef
  const vehicleOne = vehicles.find(vehicle => vehicle.sequence === 1)?.id
  const vehicleTwo = vehicles.find(vehicle => vehicle.sequence === 2)?.id
  const studentA = familyA.lines.find(line => line.kind === "student")?.personRef
  const adultA = familyA.lines.find(line => line.kind === "adult")?.personRef
  const studentB = familyB.lines[0]?.personRef
  if (!teacher || !importedStudent || !vehicleOne || !vehicleTwo || !studentA || !adultA || !studentB) throw new Error("Five-person continuation fixture incomplete")
  const initial = [{ personRef: studentA, vehicleId: vehicleOne }, { personRef: adultA, vehicleId: vehicleOne }, { personRef: teacher, vehicleId: vehicleOne }, { personRef: studentB, vehicleId: vehicleTwo }, { personRef: importedStudent, vehicleId: vehicleTwo }]
  return { scope, catalog, unrelated, admin, manager, school, guideOne, guideTwo, familyA, familyB, vehicleInput, vehicleOne, vehicleTwo, studentA, adultA, studentB, teacher, importedStudent, initial }
}

export type ContinuationFixture = Awaited<ReturnType<typeof createContinuationFixture>>
