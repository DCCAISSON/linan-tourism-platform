import ExcelJS from "exceljs"
import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { closeCatalogTripDatabase, createCatalogTripApp, createScope, dataSource, databaseUrl, DEV_ADMIN_HEADERS, initializeCatalogTripDatabase } from "./catalog-trip-fixture.js"
import { createCatalog, familyHeader, restoreNodeEnv } from "./enrollment-consent-fixture.js"
import { collectBinary, payEnrollment, schoolStaffHeaders } from "./roster-export-fixture.js"
import { cleanupConsistencyData, createScopedStaff } from "./data-consistency-fixture.js"

describe.skipIf(databaseUrl === undefined)("Paid roster placement consistency", () => {
  let app: INestApplication
  let scope: string
  const previousEnv = process.env["NODE_ENV"]
  const previousKey = process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"]
  beforeAll(async () => {
    process.env["NODE_ENV"] = "development"
    process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"] = Buffer.alloc(32, 17).toString("base64")
    await initializeCatalogTripDatabase()
    app = await createCatalogTripApp()
  })
  beforeEach(() => { scope = createScope() })
  afterEach(async () => { await cleanupConsistencyData(scope) })
  afterAll(async () => {
    await app.close()
    await closeCatalogTripDatabase()
    restoreNodeEnv(previousEnv)
    if (previousKey === undefined) delete process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"]
    else process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"] = previousKey
  })

  async function movedParticipant() {
    const catalog = await createCatalog(app, scope)
    const orderId = await payEnrollment({ app, scope, catalog, family: "s", names: ["Synthetic Child"], status: "succeeded" })
    const grade = await request(app.getHttpServer()).post(`/schools/${catalog.schoolId}/grades`).set(DEV_ADMIN_HEADERS)
      .send({ code: `grade-${scope}-new`, name: "New Grade" }).expect(201)
    const schoolClass = await request(app.getHttpServer()).post(`/grades/${grade.body.id}/classes`).set(DEV_ADMIN_HEADERS)
      .send({ code: `class-${scope}-new`, name: "New Class" }).expect(201)
    const members = await request(app.getHttpServer()).get("/enrollment/members").set(familyHeader(scope, "s")).expect(200)
    await request(app.getHttpServer()).patch(`/enrollment/members/${members.body[0].id}`).set(familyHeader(scope, "s"))
      .send({ gradeId: grade.body.id, classId: schoolClass.body.id }).expect(200)
    return { catalog, orderId, newGradeId: String(grade.body.id), newClassId: String(schoolClass.body.id) }
  }

  it("keeps original grade/class IDs, names, totals and Excel aligned with Travelers after member updates", async () => {
    const { catalog, newGradeId, newClassId } = await movedParticipant()
    const query = { tourSessionId: catalog.tourSessionId, gradeId: catalog.gradeId, classId: catalog.classId }
    const summary = await request(app.getHttpServer()).get("/roster/summary").set(DEV_ADMIN_HEADERS).query(query).expect(200)
    expect(summary.body).toMatchObject({ paidHeadcount: 1, paidAmountFen: 1200, rows: [{
      gradeId: catalog.gradeId, classId: catalog.classId, gradeName: "Grade One", className: "Class One", amountFen: 1200,
    }] })
    const totals = await request(app.getHttpServer()).get("/roster/payment-summary").set(DEV_ADMIN_HEADERS).query(query).expect(200)
    expect(totals.body).toMatchObject({ paidHeadcount: 1, paidAmountFen: 1200 })
    const all = await request(app.getHttpServer()).get("/roster/summary").set(DEV_ADMIN_HEADERS).query({ tourSessionId: catalog.tourSessionId }).expect(200)
    expect(all.body.rows).toEqual(summary.body.rows)
    for (const filter of [{ gradeId: newGradeId }, { classId: newClassId }]) {
      const moved = await request(app.getHttpServer()).get("/roster/summary").set(DEV_ADMIN_HEADERS).query({ tourSessionId: catalog.tourSessionId, ...filter }).expect(200)
      expect(moved.body).toMatchObject({ paidHeadcount: 0, paidAmountFen: 0, rows: [] })
    }
    const travelers = await request(app.getHttpServer()).get(`/travelers/sessions/${catalog.tourSessionId}`).set(DEV_ADMIN_HEADERS).query({ classId: catalog.classId }).expect(200)
    expect(travelers.body.travelers).toEqual([expect.objectContaining({
      gradeId: catalog.gradeId, classId: catalog.classId, gradeName: "Grade One", className: "Class One",
    })])
    const exported = await request(app.getHttpServer()).get("/roster/export.xlsx").set(DEV_ADMIN_HEADERS).query(query)
      .buffer(true).parse(collectBinary).expect(200)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(exported.body)
    const sheet = workbook.getWorksheet("Roster")
    expect(sheet?.rowCount).toBe(2)
    expect(sheet?.getRow(2).getCell(2).value).toBe("Grade One")
    expect(sheet?.getRow(2).getCell(3).value).toBe("Class One")
    expect(sheet?.getRow(2).getCell(7).value).toBe(1200)
  })

  it("enforces original-class access and does not reveal a historical participant to the new class", async () => {
    const { catalog, newClassId } = await movedParticipant()
    const oldStaff = await createScopedStaff({ scope, permissions: ["roster.read", "roster.export"], staffScope: { kind: "class", id: catalog.classId } })
    const newStaff = await createScopedStaff({ scope, permissions: ["roster.read", "roster.export"], staffScope: { kind: "class", id: newClassId } })
    const base = { tourSessionId: catalog.tourSessionId }
    for (const path of ["/roster/summary", "/roster/export.xlsx"]) {
      await request(app.getHttpServer()).get(path).set(newStaff).query({ ...base, classId: catalog.classId }).expect(403)
      await request(app.getHttpServer()).get(path).set(oldStaff).query({ ...base, classId: newClassId }).expect(403)
      await request(app.getHttpServer()).get(path).set(oldStaff).query(base).expect(403)
      await request(app.getHttpServer()).get(path).set(schoolStaffHeaders("other-synthetic-school")).query(base).expect(403)
    }
    const oldRows = await request(app.getHttpServer()).get("/roster/summary").set(oldStaff).query({ ...base, classId: catalog.classId }).expect(200)
    expect(oldRows.body.paidHeadcount).toBe(1)
    const newRows = await request(app.getHttpServer()).get("/roster/summary").set(newStaff).query({ ...base, classId: newClassId }).expect(200)
    expect(newRows.body.rows).toEqual([])
    const exported = await request(app.getHttpServer()).get("/roster/export.xlsx").set(newStaff).query({ ...base, classId: newClassId }).buffer(true).parse(collectBinary).expect(200)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(exported.body)
    expect(workbook.getWorksheet("Roster")?.rowCount).toBe(1)
  })

  it("retains existing current-placement fallback for legacy records without enrollment placement snapshots", async () => {
    const { catalog, orderId, newGradeId, newClassId } = await movedParticipant()
    await dataSource.query("update enrollment_participants ep join order_lines ol on ol.enrollment_participant_id=ep.id set ep.grade_id_snapshot=null, ep.class_id_snapshot=null where ol.order_id=?", [orderId])
    await dataSource.query("update order_lines set grade_name_snapshot=null, class_name_snapshot=null where order_id=?", [orderId])
    const query = { tourSessionId: catalog.tourSessionId, gradeId: newGradeId, classId: newClassId }
    const summary = await request(app.getHttpServer()).get("/roster/summary").set(DEV_ADMIN_HEADERS).query(query).expect(200)
    expect(summary.body).toMatchObject({ paidHeadcount: 1, paidAmountFen: 1200, rows: [{
      gradeId: newGradeId, classId: newClassId, gradeName: "New Grade", className: "New Class",
    }] })
  })
})
