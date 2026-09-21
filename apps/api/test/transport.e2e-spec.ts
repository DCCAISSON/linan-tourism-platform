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
    expect(saved.body.warnings.join("\n")).toContain("488")
    expect(saved.body.warnings.join("\n")).toContain("492")

    const read = await request(app.getHttpServer())
      .get(`/transport/sessions/${catalog.tourSessionId}/plan`)
      .set(DEV_ADMIN_HEADERS)
      .expect(200)
    expect(read.body).toMatchObject(saved.body)

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
    await request(app.getHttpServer())
      .put(`/transport/sessions/${catalog.tourSessionId}/plan`)
      .set(DEV_ADMIN_HEADERS)
      .set("Origin", ORIGIN)
      .send({ vehicles: [negativeVehicle(catalog.classId)] })
      .expect(400)

    const read = await request(app.getHttpServer())
      .get(`/transport/sessions/${catalog.tourSessionId}/plan`)
      .set(DEV_ADMIN_HEADERS)
      .expect(200)
    expect(read.body.vehicles).toHaveLength(1)
    expect(read.body.vehicles[0]).toMatchObject({ sequence: 1, seatCapacity: 2 })
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
  await dataSource.query("delete a from transport_class_allocations a join transport_session_vehicles v on v.id = a.vehicle_id join tour_sessions ts on ts.id = v.tour_session_id where ts.code like ?", [`session-${scope}%`])
  await dataSource.query("delete v from transport_session_vehicles v join tour_sessions ts on ts.id = v.tour_session_id where ts.code like ?", [`session-${scope}%`])
  await dataSource.query("delete from audit_logs where organization_id in (select id from organizations where code like ?)", [`school-${scope}%`])
  await dataSource.query("update tour_sessions set active_notice_id = null where code like ?", [`session-${scope}%`])
  await dataSource.query("delete nv from notice_versions nv join tour_sessions ts on ts.id = nv.tour_session_id where ts.code like ?", [`session-${scope}%`])
  await dataSource.query("delete from tour_sessions where code like ?", [`session-${scope}%`])
  await dataSource.query("delete from catalog_items where code like ?", [`catalog-${scope}%`])
  await dataSource.query("delete from school_classes where grade_id in (select id from school_grades where code like ?)", [`grade-${scope}%`])
  await dataSource.query("delete from school_grades where code like ?", [`grade-${scope}%`])
  await dataSource.query("delete from organizations where code like ?", [`school-${scope}%`])
}

function restoreOrigin(value: string | undefined): void {
  if (value === undefined) {
    delete process.env["ADMIN_WEB_ORIGIN"]
    return
  }
  process.env["ADMIN_WEB_ORIGIN"] = value
}
