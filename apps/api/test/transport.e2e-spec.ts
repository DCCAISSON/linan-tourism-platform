import ExcelJS from "exceljs"
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
import { createCatalog, restoreNodeEnv } from "./enrollment-consent-fixture.js"
import { collectBinary, schoolStaffHeaders } from "./roster-export-fixture.js"

const ORIGIN = "http://127.0.0.1:5173"
const EXPECTED_EXPORT_HEADERS = ["班级人数", "车号/车型", "车牌号码", "驾驶员", "电话", "导游", "电话", "老师", "联系电话"] as const

describe.skipIf(databaseUrl === undefined)("Transport planning API", () => {
  let app: INestApplication
  let scope: string
  let previousNodeEnv: string | undefined
  let previousOrigin: string | undefined

  beforeAll(async () => {
    await initializeCatalogTripDatabase()
  })

  beforeEach(async () => {
    scope = createScope()
    previousNodeEnv = process.env["NODE_ENV"]
    previousOrigin = process.env["ADMIN_WEB_ORIGIN"]
    process.env["NODE_ENV"] = "development"
    process.env["ADMIN_WEB_ORIGIN"] = ORIGIN
    app = await createCatalogTripApp()
  })

  afterEach(async () => {
    await app.close()
    await cleanup(scope)
    restoreNodeEnv(previousNodeEnv)
    restoreOrigin(previousOrigin)
  })

  afterAll(async () => {
    await closeCatalogTripDatabase()
  })

  it("saves split and mixed class vehicles transactionally and exports the nine-column contact sheet", async () => {
    const catalog = await createCatalog(app, scope)
    const classTwo = await createClass(app, catalog.gradeId, `class-${scope}-two`, "Class Two")
    const plan = transportPlan(catalog.classId, classTwo.body.id)

    const saved = await request(app.getHttpServer())
      .put(`/transport/sessions/${catalog.tourSessionId}/plan`)
      .set(DEV_ADMIN_HEADERS)
      .set("Origin", ORIGIN)
      .send(plan)
      .expect(200)

    expect(saved.body.totals).toMatchObject({ studentCount: 3, guardianCount: 2, teacherCount: 1, occupancy: 6, seatCapacity: 6 })
    expect(saved.body.vehicles).toHaveLength(2)
    expect(saved.body.vehicles[0]).toMatchObject({ sequence: 1, occupancy: 3, remainingSeats: 0, warnings: [] })
    expect(saved.body.vehicles[1].allocations).toHaveLength(2)
    expect(saved.body.warnings).toEqual([])

    const read = await request(app.getHttpServer())
      .get(`/transport/sessions/${catalog.tourSessionId}/plan`)
      .set(DEV_ADMIN_HEADERS)
      .expect(200)
    expect(read.body).toMatchObject(saved.body)
    expect(read.body.vehicles[0].contactSnapshot.driverPhone).toBe("19900000001")

    const nonsensitiveRead = await request(app.getHttpServer())
      .get(`/transport/sessions/${catalog.tourSessionId}/plan`)
      .set(schoolStaffHeaders(catalog.schoolId))
      .expect(200)
    expect(nonsensitiveRead.body.vehicles[0].contactSnapshot).toEqual({ driverName: "", driverPhone: "", guideName: "", guidePhone: "", teacherName: "", teacherPhone: "" })

    await request(app.getHttpServer())
      .get(`/transport/sessions/${catalog.tourSessionId}/export.xlsx`)
      .set(schoolStaffHeaders(catalog.schoolId))
      .expect(403)

    const exported = await request(app.getHttpServer())
      .get(`/transport/sessions/${catalog.tourSessionId}/export.xlsx`)
      .set(DEV_ADMIN_HEADERS)
      .buffer()
      .parse(collectBinary)
      .expect(200)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(exported.body)
    const sheet = workbook.worksheets[0]
    expect(sheet?.getRow(1).values).toEqual([undefined, ...EXPECTED_EXPORT_HEADERS])
    expect(sheet?.getRow(sheet.rowCount).getCell(1).value).toBe("学生：3人 家长：2人 老师：1人 其他：0人 合计：6人")
    expect(sheet?.getRow(2).getCell(3).value).toBe("'=浙A12345")

    const audits: readonly { readonly action: string }[] = await dataSource.query(
      "select action from audit_logs where target_id = ? order by created_at",
      [catalog.tourSessionId],
    )
    expect(audits.map((row) => row.action)).toEqual(expect.arrayContaining(["transport.plan.saved", "transport.plan.exported"]))
  })

  it("rejects invalid allocation plans before changing the stored plan", async () => {
    const catalog = await createCatalog(app, scope)
    await request(app.getHttpServer())
      .put(`/transport/sessions/${catalog.tourSessionId}/plan`)
      .set(DEV_ADMIN_HEADERS)
      .set("Origin", ORIGIN)
      .send({ vehicles: [blankVehicle(catalog.classId, 1, 2)] })
      .expect(200)

    await request(app.getHttpServer())
      .put(`/transport/sessions/${catalog.tourSessionId}/plan`)
      .set(DEV_ADMIN_HEADERS)
      .set("Origin", ORIGIN)
      .send({ vehicles: [overloadedVehicle(catalog.classId)] })
      .expect(400)
      .expect((response) => expect(response.body.message).toBe("车辆1超载：容量2人，已安排3人"))
    await request(app.getHttpServer())
      .put(`/transport/sessions/${catalog.tourSessionId}/plan`)
      .set(DEV_ADMIN_HEADERS)
      .set("Origin", ORIGIN)
      .send({ vehicles: [blankVehicle(catalog.classId, 1, 2), blankVehicle(catalog.classId, 1, 2)] })
      .expect(400)
      .expect((response) => expect(response.body.message).toBe("车号1重复"))
    await request(app.getHttpServer())
      .put(`/transport/sessions/${catalog.tourSessionId}/plan`)
      .set(DEV_ADMIN_HEADERS)
      .set("Origin", ORIGIN)
      .send({ vehicles: [negativeVehicle(catalog.classId)] })
      .expect(400)
      .expect((response) => expect(response.body.message).toBe("乘车人数必须为非负整数"))
    await request(app.getHttpServer())
      .put(`/transport/sessions/${catalog.tourSessionId}/plan`)
      .set(DEV_ADMIN_HEADERS)
      .set("Origin", ORIGIN)
      .send({ vehicles: [duplicateClassVehicle(catalog.classId)] })
      .expect(400)
      .expect((response) => expect(response.body.message).toBe(`车辆1中班级${catalog.classId}重复安排`))

    const read = await request(app.getHttpServer())
      .get(`/transport/sessions/${catalog.tourSessionId}/plan`)
      .set(DEV_ADMIN_HEADERS)
      .expect(200)
    expect(read.body.vehicles).toHaveLength(1)
    expect(read.body.vehicles[0]).toMatchObject({ sequence: 1, seatCapacity: 2 })
    expect(read.body.vehicles[0].warnings).toContain("1号车未满载：容量2人，已安排1人")
  })

	  it("rejects cross-session classes and sensitive contacts without the sensitive grant", async () => {
    const catalog = await createCatalog(app, scope)
    const other = await createCatalog(app, `${scope}-other`)
    await request(app.getHttpServer())
      .put(`/transport/sessions/${catalog.tourSessionId}/plan`)
      .set(DEV_ADMIN_HEADERS)
      .set("Origin", ORIGIN)
      .send({ vehicles: [blankVehicle(other.classId, 1, 2)] })
      .expect(400)

    await request(app.getHttpServer())
      .put(`/transport/sessions/${catalog.tourSessionId}/plan`)
      .set(schoolStaffHeaders(catalog.schoolId))
      .set("Origin", ORIGIN)
      .send({ vehicles: [vehicleWithContact(catalog.classId)] })
      .expect(403)
	  })

	  it("keeps vehicle ids stable and protects person assignments with plan and roster versions", async () => {
	    const catalog = await createCatalog(app, scope)
	    await seedImportedTeacher(catalog, scope)
	    const saved = await request(app.getHttpServer())
	      .put(`/transport/sessions/${catalog.tourSessionId}/plan`)
	      .set(DEV_ADMIN_HEADERS)
	      .set("Origin", ORIGIN)
	      .send({ vehicles: [blankVehicle(catalog.classId, 1, 2)] })
	      .expect(200)
	    const vehicleId = saved.body.vehicles[0].id

	    const peoplePlan = await request(app.getHttpServer())
	      .get(`/transport/sessions/${catalog.tourSessionId}/people-plan`)
	      .set(DEV_ADMIN_HEADERS)
	      .expect(200)
	    expect(peoplePlan.body.unassigned[0]).toMatchObject({ personRef: `imported:teacher-${scope}`, active: true })

	    const assigned = await request(app.getHttpServer())
	      .put(`/transport/sessions/${catalog.tourSessionId}/person-allocations`)
	      .set(DEV_ADMIN_HEADERS)
	      .set("Origin", ORIGIN)
	      .send({
	        expectedPlanVersion: peoplePlan.body.planVersion,
	        expectedRosterVersion: peoplePlan.body.rosterVersion,
	        assignments: [{ personRef: `imported:teacher-${scope}`, vehicleId }],
	      })
	      .expect(200)
	    expect(assigned.body.vehicles[0]).toMatchObject({ id: vehicleId, actualOccupancy: 1, estimatedOccupancy: 1 })

	    const confirmed = await request(app.getHttpServer())
	      .post(`/transport/sessions/${catalog.tourSessionId}/confirmations`)
	      .set(DEV_ADMIN_HEADERS)
	      .set("Origin", ORIGIN)
	      .send({ expectedPlanVersion: assigned.body.planVersion, expectedRosterVersion: assigned.body.rosterVersion })
	      .expect(201)
	    expect(confirmed.body.confirmation).toMatchObject({ status: "current", planVersion: assigned.body.planVersion })

	    const resaved = await request(app.getHttpServer())
	      .put(`/transport/sessions/${catalog.tourSessionId}/plan`)
	      .set(DEV_ADMIN_HEADERS)
	      .set("Origin", ORIGIN)
	      .send({ vehicles: [blankVehicle(catalog.classId, 1, 3)] })
	      .expect(200)
	    expect(resaved.body.vehicles[0].id).toBe(vehicleId)

	    const stale = await request(app.getHttpServer())
	      .get(`/transport/sessions/${catalog.tourSessionId}/people-plan`)
	      .set(DEV_ADMIN_HEADERS)
	      .expect(200)
	    expect(stale.body.confirmation).toMatchObject({ status: "stale" })

	    await request(app.getHttpServer())
	      .put(`/transport/sessions/${catalog.tourSessionId}/person-allocations`)
	      .set(DEV_ADMIN_HEADERS)
	      .set("Origin", ORIGIN)
	      .send({
	        expectedPlanVersion: assigned.body.planVersion,
	        expectedRosterVersion: assigned.body.rosterVersion,
	        assignments: [{ personRef: `imported:teacher-${scope}`, vehicleId }],
	      })
	      .expect(409)

	    await request(app.getHttpServer())
	      .put(`/transport/sessions/${catalog.tourSessionId}/plan`)
	      .set(DEV_ADMIN_HEADERS)
	      .set("Origin", ORIGIN)
	      .send({ vehicles: [] })
	      .expect(409)
	  })
	})

function transportPlan(classOne: string, classTwo: string) {
  return {
    vehicles: [
      {
        sequence: 1,
        seatCapacity: 3,
        plateNumber: "=浙A12345",
        contactSnapshot: { driverName: "驾驶员一", driverPhone: "19900000001", guideName: "导游一", guidePhone: "19900000002", teacherName: "老师一", teacherPhone: "19900000003" },
        allocations: [{ classId: classOne, studentCount: 1, guardianCount: 1, teacherCount: 1, otherCount: 0, note: "" }],
      },
      {
        sequence: 2,
        seatCapacity: 3,
        plateNumber: "",
        contactSnapshot: emptyContact(),
        allocations: [
          { classId: classOne, studentCount: 1, guardianCount: 0, teacherCount: 0, otherCount: 0, note: "split" },
          { classId: classTwo, studentCount: 1, guardianCount: 1, teacherCount: 0, otherCount: 0, note: "mixed" },
        ],
      },
    ],
  }
}

function blankVehicle(classId: string, sequence: number, seatCapacity: number) {
  return {
    sequence,
    seatCapacity,
    plateNumber: "",
    contactSnapshot: emptyContact(),
    allocations: [{ classId, studentCount: 1, guardianCount: 0, teacherCount: 0, otherCount: 0, note: "" }],
  }
}

function overloadedVehicle(classId: string) {
  return { ...blankVehicle(classId, 1, 2), allocations: [{ classId, studentCount: 1, guardianCount: 1, teacherCount: 1, otherCount: 0, note: "" }] }
}

function negativeVehicle(classId: string) {
  return { ...blankVehicle(classId, 1, 2), allocations: [{ classId, studentCount: -1, guardianCount: 0, teacherCount: 0, otherCount: 0, note: "" }] }
}

function duplicateClassVehicle(classId: string) {
  return { ...blankVehicle(classId, 1, 4), allocations: [
    { classId, studentCount: 1, guardianCount: 0, teacherCount: 0, otherCount: 0, note: "" },
    { classId, studentCount: 1, guardianCount: 0, teacherCount: 0, otherCount: 0, note: "" },
  ] }
}

function vehicleWithContact(classId: string) {
  return { ...blankVehicle(classId, 1, 2), contactSnapshot: { ...emptyContact(), driverPhone: "19900000004" } }
}

function emptyContact() {
  return { driverName: "", driverPhone: "", guideName: "", guidePhone: "", teacherName: "", teacherPhone: "" }
}

async function createClass(app: INestApplication, gradeId: string, code: string, name: string) {
  return request(app.getHttpServer()).post(`/grades/${gradeId}/classes`).set(DEV_ADMIN_HEADERS).send({ code, name }).expect(201)
}

async function cleanup(scope: string): Promise<void> {
  await dataSource.query("update transport_plans p join tour_sessions ts on ts.id = p.tour_session_id set p.current_confirmation_id = null where ts.code like ?", [`session-${scope}%`])
  await dataSource.query("delete c from transport_confirmations c join tour_sessions ts on ts.id = c.tour_session_id where ts.code like ?", [`session-${scope}%`])
  await dataSource.query("delete p from transport_person_allocations p join tour_sessions ts on ts.id = p.tour_session_id where ts.code like ?", [`session-${scope}%`])
  await dataSource.query("delete p from transport_plans p join tour_sessions ts on ts.id = p.tour_session_id where ts.code like ?", [`session-${scope}%`])
  await dataSource.query("delete a from transport_class_allocations a join transport_session_vehicles v on v.id = a.vehicle_id join tour_sessions ts on ts.id = v.tour_session_id where ts.code like ?", [`session-${scope}%`])
  await dataSource.query("delete v from transport_session_vehicles v join tour_sessions ts on ts.id = v.tour_session_id where ts.code like ?", [`session-${scope}%`])
  await dataSource.query("delete p from roster_import_people p join roster_import_batches b on b.id = p.batch_id where b.file_name like ?", [`transport-${scope}%`])
  await dataSource.query("delete from roster_import_batches where file_name like ?", [`transport-${scope}%`])
  await dataSource.query("delete from audit_logs where organization_id in (select id from organizations where code like ?)", [`school-${scope}%`])
  await dataSource.query("update tour_sessions set active_notice_id = null where code like ?", [`session-${scope}%`])
  await dataSource.query("delete nv from notice_versions nv join tour_sessions ts on ts.id = nv.tour_session_id where ts.code like ?", [`session-${scope}%`])
  await dataSource.query("delete from tour_sessions where code like ?", [`session-${scope}%`])
  await dataSource.query("delete from catalog_items where code like ?", [`catalog-${scope}%`])
  await dataSource.query("delete from school_classes where grade_id in (select id from school_grades where code like ?)", [`grade-${scope}%`])
  await dataSource.query("delete from school_grades where code like ?", [`grade-${scope}%`])
  await dataSource.query("delete from organizations where code like ?", [`school-${scope}%`])
}

async function seedImportedTeacher(catalog: { readonly schoolId: string; readonly tourSessionId: string; readonly gradeId: string; readonly classId: string }, scope: string): Promise<void> {
  await dataSource.query(`
    insert into roster_import_batches
      (id, organization_id, tour_session_id, grade_id, class_id, source_template, file_name, created_by, total_rows, imported_count, duplicate_count, error_count, policy_version)
    values (?, ?, ?, ?, ?, 'teacher', ?, 'dev-admin', 1, 1, 0, 0, 'test')
  `, [`batch-${scope}`, catalog.schoolId, catalog.tourSessionId, catalog.gradeId, catalog.classId, `transport-${scope}.xlsx`])
  await dataSource.query(`
    insert into roster_import_people
      (id, batch_id, organization_id, tour_session_id, grade_id, class_id, source_row_number, source_class_name, role, display_name,
       identity_ciphertext, identity_hash, identity_masked, phone_ciphertext, phone_hash, phone_masked, person_data_key_version,
       created_by, status, version, eligibility_status, eligibility_reason)
    values (?, ?, ?, ?, ?, ?, 2, '一班', 'teacher', '带队老师',
      'cipher', ?, '********0001', null, null, null, 'v1', 'dev-admin', 'active', 1, 'pending', null)
  `, [`teacher-${scope}`, `batch-${scope}`, catalog.schoolId, catalog.tourSessionId, catalog.gradeId, catalog.classId, `${scope.padEnd(64, "0").slice(0, 64)}`])
}

function restoreOrigin(value: string | undefined): void {
  if (value === undefined) {
    delete process.env["ADMIN_WEB_ORIGIN"]
    return
  }
  process.env["ADMIN_WEB_ORIGIN"] = value
}
