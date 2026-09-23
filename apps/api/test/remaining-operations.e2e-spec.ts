import ExcelJS from "exceljs"
import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { ExecutionGuideAssignmentService } from "../src/modules/execution/execution-guide-assignment.service.js"
import { ExecutionService } from "../src/modules/execution/execution.service.js"
import type { StaffAccess } from "../src/modules/iam/dev-staff-access.service.js"
import type { StaffPermissionKey, StaffScope } from "../src/modules/iam/staff-permissions.js"
import type { PersonRef } from "../src/modules/travelers/travelers.types.js"
import {
  closeCatalogTripDatabase,
  createCatalogTripApp,
  createScope,
  dataSource,
  databaseUrl,
  DEV_ADMIN_HEADERS,
  initializeCatalogTripDatabase,
} from "./catalog-trip-fixture.js"
import { createCatalog, restoreNodeEnv, virtualPhone, virtualResidentId } from "./enrollment-consent-fixture.js"
import { payEnrollment } from "./roster-export-fixture.js"

const ORIGIN = "http://127.0.0.1:5173"
const PERSON_DATA_KEY = Buffer.alloc(32, 14).toString("base64")

type Catalog = Awaited<ReturnType<typeof createCatalog>>
type CountRow = { readonly count: number | string }
type AssignmentInput = { readonly personRef: PersonRef; readonly vehicleId: string }
type TestIdentity = { readonly participantKind: "student"; readonly identityNumber: string; readonly phone: string }

let app: INestApplication | null = null

describe.skipIf(databaseUrl === undefined)("Remaining operations DB e2e", () => {
  let previousNodeEnv: string | undefined
  let previousOrigin: string | undefined
  let previousPersonDataKey: string | undefined

  beforeAll(async () => {
    previousNodeEnv = process.env["NODE_ENV"]
    previousOrigin = process.env["ADMIN_WEB_ORIGIN"]
    previousPersonDataKey = process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"]
    process.env["NODE_ENV"] = "development"
    process.env["ADMIN_WEB_ORIGIN"] = ORIGIN
    process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"] = PERSON_DATA_KEY
    await initializeCatalogTripDatabase()
    app = await createCatalogTripApp()
  })

  afterAll(async () => {
    await currentApp().close()
    app = null
    restoreNodeEnv(previousNodeEnv)
    restoreEnv("ADMIN_WEB_ORIGIN", previousOrigin)
    restoreEnv("PERSON_DATA_ENCRYPTION_KEY_BASE64", previousPersonDataKey)
    await closeCatalogTripDatabase()
  })

  it("merges paid and imported people by stable identity and exposes cancelled-paid import conflicts", async () => {
    const scope = createScope()
    process.stdout.write(`[todo14-scope:operations] ${scope}\n`)
    try {
      const catalog = await createCatalog(currentApp(), scope)
      const mergeIdentity = identity("20160101", "141")
      const conflictIdentity = identity("20160101", "142")
      await payEnrollment({ app: currentApp(), scope, catalog, family: "merge", names: ["Merge Student"], status: "succeeded", identities: [mergeIdentity] })
      const conflictOrderId = await payEnrollment({ app: currentApp(), scope, catalog, family: "c", names: ["Conflict Student"], status: "succeeded", identities: [conflictIdentity] })
      const conflictPaidRef = await firstPaidRef(conflictOrderId)
      await dataSource.query("update roster_entries set status = 'cancelled' where enrollment_participant_id = (select enrollment_participant_id from order_lines where id = ?)", [stripPaidRef(conflictPaidRef)])
      await importRoster(scope, catalog, [
        ["Merge Student", mergeIdentity.identityNumber, mergeIdentity.phone],
        ["Conflict Student", conflictIdentity.identityNumber, conflictIdentity.phone],
      ])

      const travelers = await request(server()).get(`/travelers/sessions/${catalog.tourSessionId}`).set(DEV_ADMIN_HEADERS).query({ includeInactive: "true", pageSize: "100" }).expect(200)
      const merged = travelers.body.travelers.find((row: { readonly displayName: string }) => row.displayName === "Merge Student")
      const conflicted = travelers.body.travelers.find((row: { readonly displayName: string }) => row.displayName === "Conflict Student")

      expect(merged).toMatchObject({ active: true, conflict: null })
      expect(merged.sourceRefs).toEqual(expect.arrayContaining([expect.stringMatching(/^paid:/), expect.stringMatching(/^imported:/)]))
      expect(conflicted).toMatchObject({ active: false, conflict: { code: "eligibility_conflict" } })
      expect(travelers.body.conflictCount).toBe(1)
    } finally {
      await cleanupOperations(scope)
    }
  })

  it("persists person vehicle allocation, blocks stale writes, and requires school reconfirmation after processed pretrip adjustment", async () => {
    const scope = createScope()
    process.stdout.write(`[todo14-scope:operations] ${scope}\n`)
    try {
      const catalog = await createCatalog(currentApp(), scope)
      await ensureStaffAccount(schoolActor(scope), `school-${scope}`)
      const orderId = await payEnrollment({ app: currentApp(), scope, catalog, family: "vehicle", names: ["Vehicle Student"], status: "succeeded", identities: [identity("20160101", "143")] })
      const paidRef = await firstPaidRef(orderId)
      const vehicleId = await saveVehiclePlan(catalog, 2)
      const peoplePlan = await readPeoplePlan(catalog.tourSessionId)
      await savePersonAssignments(catalog.tourSessionId, peoplePlan.body.planVersion, peoplePlan.body.rosterVersion, [{ personRef: paidRef, vehicleId }], 200)
      const assigned = await readPeoplePlan(catalog.tourSessionId)
      expect(assigned.body.assignments).toEqual([expect.objectContaining({ personRef: paidRef, vehicleId })])
      await savePersonAssignments(catalog.tourSessionId, peoplePlan.body.planVersion, peoplePlan.body.rosterVersion, [{ personRef: paidRef, vehicleId }], 409)
      await confirmTransport(catalog.tourSessionId, assigned.body.planVersion, assigned.body.rosterVersion)

      await request(server()).post(`/pretrip/school/sessions/${catalog.tourSessionId}/confirmations`).set(schoolHeaders(scope, catalog.schoolId)).set("Origin", ORIGIN).expect(201)
      await request(server()).post(`/pretrip/school/sessions/${catalog.tourSessionId}/adjustments`).set(schoolHeaders(scope, catalog.schoolId)).set("Origin", ORIGIN).send({ kind: "vehicle_change", personRef: "line-1", requestText: "invalid" }).expect(400)
      const otherScope = `${scope}-o`
      const other = await createCatalog(currentApp(), otherScope)
      const otherOrderId = await payEnrollment({ app: currentApp(), scope: otherScope, catalog: other, family: "o", names: ["Other Student"], status: "succeeded", identities: [identity("20160101", "144")] })
      await request(server()).post(`/pretrip/school/sessions/${catalog.tourSessionId}/adjustments`).set(schoolHeaders(scope, other.schoolId)).set("Origin", ORIGIN).send({ kind: "vehicle_change", personRef: paidRef, requestText: "wrong school" }).expect(403)
      await request(server()).post(`/pretrip/school/sessions/${catalog.tourSessionId}/adjustments`).set(schoolHeaders(scope, catalog.schoolId)).set("Origin", ORIGIN).send({ kind: "vehicle_change", personRef: await firstPaidRef(otherOrderId), requestText: "outside person" }).expect(404)

      const adjustment = await request(server()).post(`/pretrip/school/sessions/${catalog.tourSessionId}/adjustments`).set(schoolHeaders(scope, catalog.schoolId)).set("Origin", ORIGIN).send({ kind: "vehicle_change", personRef: paidRef, requestText: "move to front seat" }).expect(201)
      await request(server()).post(`/pretrip/staff/adjustments/${adjustment.body.id}/process`).set(DEV_ADMIN_HEADERS).set("Origin", ORIGIN).send({ decision: "accepted", responseText: "will reissue" }).expect(201)
      const superseded: readonly { readonly status: string }[] = await dataSource.query("select status from pretrip_school_confirmations where tour_session_id = ? order by signed_at", [catalog.tourSessionId])
      expect(superseded.map((row) => row.status)).toEqual(["superseded"])
      await request(server()).post(`/pretrip/school/sessions/${catalog.tourSessionId}/confirmations`).set(schoolHeaders(scope, catalog.schoolId)).set("Origin", ORIGIN).expect(201)
      const reconfirmed: readonly CountRow[] = await dataSource.query("select count(*) as count from pretrip_school_confirmations where tour_session_id = ? and status = 'current'", [catalog.tourSessionId])
      expect(Number(reconfirmed[0]?.count ?? 0)).toBe(1)
    } finally {
      await cleanupOperations(scope)
    }
  })

  it("requires explicit guide assignment for attendance, daily reports, and authorized health reads", async () => {
    const scope = createScope()
    process.stdout.write(`[todo14-scope:operations] ${scope}\n`)
    try {
      const catalog = await createCatalog(currentApp(), scope)
      const orderId = await payEnrollment({ app: currentApp(), scope, catalog, family: "guide", names: ["Guide Student"], status: "succeeded", identities: [identity("20160101", "145")] })
      const paidRef = await firstPaidRef(orderId)
      const vehicleId = await saveVehiclePlan(catalog, 1)
      const plan = await readPeoplePlan(catalog.tourSessionId)
      await savePersonAssignments(catalog.tourSessionId, plan.body.planVersion, plan.body.rosterVersion, [{ personRef: paidRef, vehicleId }], 200)
      const guideId = `guide-${scope}`
      await ensureStaffAccount(guideId, `guide-${scope}`)
      const adminId = `admin-${scope}`
      await ensureStaffAccount(adminId, `admin-${scope}`)
      const execution = currentApp().get(ExecutionService)
      const assignments = currentApp().get(ExecutionGuideAssignmentService)
      const guideAccess = guideStaff(guideId, catalog.tourSessionId)

      await expect(execution.saveAttendance(guideAccess, catalog.tourSessionId, paidRef, attendance("present"))).rejects.toMatchObject({ response: { code: "execution_forbidden" } })
      const assignment = await assignments.assign(adminExecutionAccess(adminId), { staffAccountId: guideId, tourSessionId: catalog.tourSessionId, vehicleId, reason: "task-14 explicit assignment" })
      await execution.saveAttendance(guideAccess, catalog.tourSessionId, paidRef, attendance("present"))
      await execution.saveDailyReport(guideAccess, catalog.tourSessionId, { reportDate: "2027-02-01", lodgingCheck: "ok", mealStatus: "ok", bodyStatus: "ok", note: "all present" })
      const attendanceRows: readonly CountRow[] = await dataSource.query("select count(*) as count from execution_attendance where tour_session_id = ? and person_ref = ? and status = 'present'", [catalog.tourSessionId, paidRef])
      const dailyRows: readonly CountRow[] = await dataSource.query("select count(*) as count from execution_daily_reports where tour_session_id = ? and report_date = '2027-02-01'", [catalog.tourSessionId])
      expect(Number(attendanceRows[0]?.count ?? 0)).toBe(1)
      expect(Number(dailyRows[0]?.count ?? 0)).toBe(1)

      await request(server()).post(`/orders/${orderId}/execution/health-authorizations`).set(familyHeaders(scope, "guide")).send({ personRef: paidRef, allergies: "synthetic peanut", medicalNotes: "synthetic note", emergencyMedicine: "synthetic medicine" }).expect(201)
      await expect(execution.readHealth(guideAccess, catalog.tourSessionId, paidRef)).resolves.toMatchObject({ active: true, health: { allergies: "synthetic peanut" } })
      await request(server()).post(`/orders/${orderId}/execution/health-authorizations/${encodeURIComponent(paidRef)}/revoke`).set(familyHeaders(scope, "guide")).expect(201)
      await expect(execution.readHealth(guideAccess, catalog.tourSessionId, paidRef)).rejects.toMatchObject({ response: { code: "execution_forbidden" } })
      await assignments.revoke(adminExecutionAccess(adminId), assignment.id, "task-14 revoke")
      await expect(execution.saveAttendance(guideAccess, catalog.tourSessionId, paidRef, attendance("absent"))).rejects.toMatchObject({ response: { code: "execution_forbidden" } })
    } finally {
      await cleanupOperations(scope)
    }
  })
})

function currentApp(): INestApplication {
  if (app === null) throw new Error("test app is not initialized")
  return app
}

function server(): ReturnType<INestApplication["getHttpServer"]> { return currentApp().getHttpServer() }

function identity(birthDate: string, sequence: string): TestIdentity { return { participantKind: "student", identityNumber: virtualResidentId(birthDate, sequence), phone: virtualPhone(sequence) } }

async function importRoster(scope: string, catalog: Catalog, people: readonly (readonly [string, string, string])[]): Promise<void> {
  await request(server()).post("/roster/imports").set(DEV_ADMIN_HEADERS).field("template", "grade_3_6").field("tourSessionId", catalog.tourSessionId).field("schoolId", catalog.schoolId).field("gradeId", catalog.gradeId).field("classId", catalog.classId).attach("file", await workbook(people), `remaining-${scope}.xlsx`).expect(201)
}

async function workbook(people: readonly (readonly [string, string, string])[]): Promise<Buffer> {
  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet("数据导入项")
  sheet.addRow([])
  sheet.addRow(["序号", "班级", "*学生姓名", "*身份证号", "生日", "年龄", "* 手机"])
  people.forEach(([name, identityNumber, phone], index) => sheet.addRow([index + 1, "Class One", name, identityNumber, "", "", phone]))
  return Buffer.from(await book.xlsx.writeBuffer())
}

async function firstPaidRef(orderId: string): Promise<PersonRef> {
  const rows: readonly { readonly id: string }[] = await dataSource.query("select id from order_lines where order_id = ? order by id limit 1", [orderId])
  const row = rows[0]
  if (row === undefined) throw new Error("paid line missing")
  return `paid:${row.id}`
}

function stripPaidRef(personRef: PersonRef): string { return personRef.startsWith("paid:") ? personRef.slice("paid:".length) : personRef }

async function saveVehiclePlan(catalog: Catalog, seatCapacity: number): Promise<string> {
  const response = await request(server()).put(`/transport/sessions/${catalog.tourSessionId}/plan`).set(DEV_ADMIN_HEADERS).set("Origin", ORIGIN).send({ vehicles: [{ sequence: 1, seatCapacity, plateNumber: "浙A00001", contactSnapshot: emptyContact(), allocations: [{ classId: catalog.classId, studentCount: 1, guardianCount: 0, teacherCount: 0, otherCount: 0, note: "" }] }] }).expect(200)
  return response.body.vehicles[0].id
}

function readPeoplePlan(tourSessionId: string) { return request(server()).get(`/transport/sessions/${tourSessionId}/people-plan`).set(DEV_ADMIN_HEADERS).expect(200) }

function savePersonAssignments(tourSessionId: string, expectedPlanVersion: number, expectedRosterVersion: string, assignments: readonly AssignmentInput[], status: number) { return request(server()).put(`/transport/sessions/${tourSessionId}/person-allocations`).set(DEV_ADMIN_HEADERS).set("Origin", ORIGIN).send({ expectedPlanVersion, expectedRosterVersion, assignments }).expect(status) }

function confirmTransport(tourSessionId: string, expectedPlanVersion: number, expectedRosterVersion: string) { return request(server()).post(`/transport/sessions/${tourSessionId}/confirmations`).set(DEV_ADMIN_HEADERS).set("Origin", ORIGIN).send({ expectedPlanVersion, expectedRosterVersion }).expect(201) }

function emptyContact() { return { driverName: "", driverPhone: "", guideName: "", guidePhone: "", teacherName: "", teacherPhone: "" } }

function schoolActor(scope: string): string { return `school-staff-${scope}` }

function schoolHeaders(scope: string, schoolId: string): Record<string, string> { return { "x-linan-dev-staff-id": schoolActor(scope), "x-linan-dev-staff-role": "school", "x-linan-dev-staff-school-id": schoolId } }

function familyHeaders(scope: string, family: string): Record<string, string> { return { "x-linan-dev-family-identity": `family-${scope}-${family}` } }

function guideStaff(actorId: string, tourSessionId: string): StaffAccess {
  return staffAccess("guide", actorId, ["execution.read", "execution.write", "health.read"], [{ kind: "tour_session", id: tourSessionId }])
}

function adminExecutionAccess(actorId: string): StaffAccess { return staffAccess("administrator", actorId, ["execution.manage"], [{ kind: "all", id: null }]) }

function staffAccess(kind: StaffAccess["kind"], actorId: string, permissions: readonly StaffPermissionKey[], scopes: readonly StaffScope[]): StaffAccess { return { kind, actorId, forcePasswordChange: false, permissionKeys: new Set(permissions), scopes } }

function attendance(status: "present" | "absent") { return { status, infoChecked: true, groupJoined: true, note: `task-14 ${status}` } }

async function ensureStaffAccount(id: string, username: string): Promise<void> {
  await dataSource.query(`
    insert into staff_accounts
      (id, username, display_name, password_hash, status, force_password_change, failed_login_attempts, locked_until, expires_at, permissions_version, created_at, updated_at)
    values (?, ?, ?, 'test-hash', 'active', false, 0, null, null, 1, current_timestamp(6), current_timestamp(6))
    on duplicate key update status = 'active', force_password_change = false, updated_at = current_timestamp(6)
  `, [id, username, `Task14 ${username}`])
}

async function cleanupOperations(scope: string): Promise<void> {
  const sessionPattern = `session-${scope}%`
  const familyPattern = `family-${scope}%`
  const staffPattern = `%${scope}%`
  await dataSource.query("delete from audit_logs where organization_id in (select id from organizations where code like ?)", [`school-${scope}%`])
  await dataSource.query("delete h from execution_health_authorizations h join tour_sessions ts on ts.id = h.tour_session_id where ts.code like ?", [sessionPattern])
  await dataSource.query("delete e from execution_events e join tour_sessions ts on ts.id = e.tour_session_id where ts.code like ?", [sessionPattern])
  await dataSource.query("delete d from execution_daily_reports d join tour_sessions ts on ts.id = d.tour_session_id where ts.code like ?", [sessionPattern])
  await dataSource.query("delete a from execution_attendance a join tour_sessions ts on ts.id = a.tour_session_id where ts.code like ?", [sessionPattern])
  await dataSource.query("delete g from execution_guide_assignments g join tour_sessions ts on ts.id = g.tour_session_id where ts.code like ?", [sessionPattern])
  await dataSource.query("delete r from pretrip_adjustment_requests r join tour_sessions ts on ts.id = r.tour_session_id where ts.code like ?", [sessionPattern])
  await dataSource.query("delete c from pretrip_school_confirmations c join tour_sessions ts on ts.id = c.tour_session_id where ts.code like ?", [sessionPattern])
  await dataSource.query("delete a from pretrip_attachments a join tour_sessions ts on ts.id = a.tour_session_id where ts.code like ?", [sessionPattern])
  await dataSource.query("delete c from pretrip_configs c join tour_sessions ts on ts.id = c.tour_session_id where ts.code like ?", [sessionPattern])
  await dataSource.query("update transport_plans p join tour_sessions ts on ts.id = p.tour_session_id set p.current_confirmation_id = null where ts.code like ?", [sessionPattern])
  await dataSource.query("delete c from transport_confirmations c join tour_sessions ts on ts.id = c.tour_session_id where ts.code like ?", [sessionPattern])
  await dataSource.query("delete p from transport_person_allocations p join tour_sessions ts on ts.id = p.tour_session_id where ts.code like ?", [sessionPattern])
  await dataSource.query("delete p from transport_plans p join tour_sessions ts on ts.id = p.tour_session_id where ts.code like ?", [sessionPattern])
  await dataSource.query("delete a from transport_class_allocations a join transport_session_vehicles v on v.id = a.vehicle_id join tour_sessions ts on ts.id = v.tour_session_id where ts.code like ?", [sessionPattern])
  await dataSource.query("delete v from transport_session_vehicles v join tour_sessions ts on ts.id = v.tour_session_id where ts.code like ?", [sessionPattern])
  await dataSource.query("delete c from traveler_import_changes c join roster_import_people p on p.id = c.import_person_id join roster_import_batches b on b.id = p.batch_id where b.file_name like ?", [`remaining-${scope}%`])
  await dataSource.query("delete e from roster_import_errors e join roster_import_batches b on b.id = e.batch_id where b.file_name like ?", [`remaining-${scope}%`])
  await dataSource.query("delete p from roster_import_people p join roster_import_batches b on b.id = p.batch_id where b.file_name like ?", [`remaining-${scope}%`])
  await dataSource.query("delete from roster_import_batches where file_name like ?", [`remaining-${scope}%`])
  await dataSource.query("delete pe from payment_events pe join payments p on p.id = pe.payment_id join orders o on o.id = p.order_id join enrollments e on e.id = o.enrollment_id join families f on f.id = e.family_id where f.code like ?", [familyPattern])
  await dataSource.query("delete p from payments p join orders o on o.id = p.order_id join enrollments e on e.id = o.enrollment_id join families f on f.id = e.family_id where f.code like ?", [familyPattern])
  await dataSource.query("delete ol from order_lines ol join orders o on o.id = ol.order_id join enrollments e on e.id = o.enrollment_id join families f on f.id = e.family_id where f.code like ?", [familyPattern])
  await dataSource.query("delete o from orders o join enrollments e on e.id = o.enrollment_id join families f on f.id = e.family_id where f.code like ?", [familyPattern])
  await dataSource.query("delete r from roster_entries r join enrollments e on e.id = r.enrollment_id join families f on f.id = e.family_id where f.code like ?", [familyPattern])
  await dataSource.query("delete from consent_records where family_id in (select id from families where code like ?)", [familyPattern])
  await dataSource.query("delete from enrollment_participants where family_id in (select id from families where code like ?)", [familyPattern])
  await dataSource.query("delete from enrollments where family_id in (select id from families where code like ?)", [familyPattern])
  await dataSource.query("delete from family_members where code like ?", [`member-${scope}%`])
  await dataSource.query("delete from families where code like ?", [familyPattern])
  await dataSource.query("update tour_sessions set active_notice_id = null where code like ?", [sessionPattern])
  await dataSource.query("delete nv from notice_versions nv join tour_sessions ts on ts.id = nv.tour_session_id where ts.code like ?", [sessionPattern])
  await dataSource.query("delete from tour_sessions where code like ?", [sessionPattern])
  await dataSource.query("delete from catalog_items where code like ?", [`catalog-${scope}%`])
  await dataSource.query("delete from school_classes where grade_id in (select id from school_grades where code like ?)", [`grade-${scope}%`])
  await dataSource.query("delete from school_grades where code like ?", [`grade-${scope}%`])
  await dataSource.query("delete from organizations where code like ?", [`school-${scope}%`])
  await dataSource.query("delete from staff_account_permissions where staff_account_id like ?", [staffPattern])
  await dataSource.query("delete from staff_account_scopes where staff_account_id like ?", [staffPattern])
  await dataSource.query("delete from staff_sessions where staff_account_id like ?", [staffPattern])
  await dataSource.query("delete from staff_accounts where id like ?", [staffPattern])
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
    return
  }
  process.env[name] = value
}
