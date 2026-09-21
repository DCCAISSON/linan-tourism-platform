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
import { createCatalog, restoreNodeEnv, virtualPhone, virtualResidentId } from "./enrollment-consent-fixture.js"
import { payEnrollment } from "./roster-export-fixture.js"

const PERSON_DATA_KEY = Buffer.alloc(32, 12).toString("base64")
const ROSTER_IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024

describe.skipIf(databaseUrl === undefined)("Roster import API", () => {
  let app: INestApplication
  let scope: string
  let previousPersonDataKey: string | undefined
  let previousSuiteNodeEnv: string | undefined

  beforeAll(async () => {
    await initializeCatalogTripDatabase()
  })

  beforeEach(async () => {
    scope = createScope()
    previousSuiteNodeEnv = process.env["NODE_ENV"]
    process.env["NODE_ENV"] = "development"
    previousPersonDataKey = process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"]
    process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"] = PERSON_DATA_KEY
    app = await createCatalogTripApp()
  })

  afterEach(async () => {
    await app.close()
    restorePersonDataKey(previousPersonDataKey)
    restoreNodeEnv(previousSuiteNodeEnv)
  })

  afterAll(async () => {
    await closeCatalogTripDatabase()
  })

  it("imports the three current templates idempotently without changing paid roster totals", async () => {
    const catalog = await createCatalog(app, scope)
    await payEnrollment({ app, scope, catalog, family: "paid", names: ["已付款学生"], status: "succeeded" })
    const paymentBefore = await request(app.getHttpServer())
      .get("/roster/payment-summary")
      .set(DEV_ADMIN_HEADERS)
      .query({ tourSessionId: catalog.tourSessionId })
      .expect(200)

    const parentChild = await importWorkbook(app, catalog, "parent_child", await parentChildWorkbook("一（1）班"))
    const parentChildAgain = await importWorkbook(app, catalog, "parent_child", await parentChildWorkbook("一（1）班"))
    const grade = await importWorkbook(app, catalog, "grade_3_6", await gradeWorkbook("三（2）班"))
    const teacher = await importWorkbook(app, catalog, "teacher", await teacherWorkbook("带队教师"), { gradeId: "", classId: "" })
    const paymentAfter = await request(app.getHttpServer())
      .get("/roster/payment-summary")
      .set(DEV_ADMIN_HEADERS)
      .query({ tourSessionId: catalog.tourSessionId })
      .expect(200)
    const people = await dataSource.query(
      "select role, display_name, source_class_name from roster_import_people where tour_session_id = ? order by role, source_class_name, display_name",
      [catalog.tourSessionId],
    )

    expect(parentChild.body).toMatchObject({ sourceTemplate: "parent_child", totalRows: 1, importedCount: 2, duplicateCount: 0, errorCount: 0 })
    expect(parentChildAgain.body).toMatchObject({ totalRows: 1, importedCount: 0, duplicateCount: 2, errorCount: 0 })
    expect(grade.body).toMatchObject({ sourceTemplate: "grade_3_6", totalRows: 1, importedCount: 1, errorCount: 0 })
    expect(teacher.body).toMatchObject({ sourceTemplate: "teacher", totalRows: 1, importedCount: 1, errorCount: 0, gradeId: null, classId: null })
    expect(paymentAfter.body).toEqual(paymentBefore.body)
    expect(people).toEqual([
      { role: "guardian", display_name: "家长一", source_class_name: "一（1）班" },
      { role: "student", display_name: "学生一", source_class_name: "一（1）班" },
      { role: "student", display_name: "学生二", source_class_name: "三（2）班" },
      { role: "teacher", display_name: "教师一", source_class_name: "带队教师" },
    ])
  })

  it("stores row-level errors and downloads them as safe CSV", async () => {
    const catalog = await createCatalog(app, scope)
    const imported = await importWorkbook(app, catalog, "grade_3_6", await invalidGradeWorkbook())

    expect(imported.body).toMatchObject({ totalRows: 1, importedCount: 0, duplicateCount: 0, errorCount: 2 })
    expect(imported.body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ rowNumber: 3, role: null, field: "className" }),
      expect.objectContaining({ rowNumber: 3, role: "student", field: "identityNumber" }),
    ]))

    const csv = await request(app.getHttpServer())
      .get(`/roster/imports/${imported.body.id}/errors.csv`)
      .set(DEV_ADMIN_HEADERS)
      .expect(200)
    expect(csv.text).toContain('"rowNumber","role","field","message"')
    expect(csv.text).toContain('"3","student","identityNumber"')
  })

  it("returns a row error when the same credential has conflicting roster details", async () => {
    const catalog = await createCatalog(app, scope)
    await importWorkbook(app, catalog, "grade_3_6", await gradeWorkbook("三（2）班"))

    const conflicted = await importWorkbook(app, catalog, "grade_3_6", await conflictingGradeWorkbook("三（2）班"))

    expect(conflicted.body).toMatchObject({ totalRows: 1, importedCount: 0, duplicateCount: 0, errorCount: 1 })
    expect(conflicted.body.errors).toEqual([
      expect.objectContaining({
        rowNumber: 3,
        role: "student",
        field: "identityNumber",
        message: "证件号码已在同团期导入，但姓名、角色、班级或手机号不一致",
      }),
    ])
  })

  it("rejects roster workbooks larger than 5MB", async () => {
    const catalog = await createCatalog(app, scope)

    const response = await request(app.getHttpServer())
      .post("/roster/imports")
      .set(DEV_ADMIN_HEADERS)
      .field("template", "grade_3_6")
      .field("tourSessionId", catalog.tourSessionId)
      .field("schoolId", catalog.schoolId)
      .field("gradeId", catalog.gradeId)
      .field("classId", catalog.classId)
      .attach("file", Buffer.alloc(ROSTER_IMPORT_MAX_FILE_BYTES + 1, 1), "large.xlsx")
      .expect(400)

    expect(response.body).toMatchObject({
      code: "malformed_input",
      message: "file must be at most 5MB",
    })
  })
})

async function importWorkbook(
  app: INestApplication,
  catalog: { readonly tourSessionId: string; readonly schoolId: string; readonly gradeId: string; readonly classId: string },
  template: string,
  buffer: Buffer,
  overrides: { readonly gradeId?: string; readonly classId?: string } = {},
) {
  return request(app.getHttpServer())
    .post("/roster/imports")
    .set(DEV_ADMIN_HEADERS)
    .field("template", template)
    .field("tourSessionId", catalog.tourSessionId)
    .field("schoolId", catalog.schoolId)
    .field("gradeId", overrides.gradeId ?? catalog.gradeId)
    .field("classId", overrides.classId ?? catalog.classId)
    .attach("file", buffer, "roster.xlsx")
    .expect(201)
}

async function parentChildWorkbook(className: string): Promise<Buffer> {
  return workbookBuffer([
    ["序号", "班级", "*学生姓名", "*身份证号", "生日", "年龄", "*家长姓名", "*身份证号", "生日", "年龄", "* 手机"],
    [1, className, "学生一", virtualResidentId("20160101", "101"), "", "", "家长一", virtualResidentId("19860101", "101"), "", "", virtualPhone("2101")],
  ])
}

async function gradeWorkbook(className: string): Promise<Buffer> {
  return workbookBuffer([
    ["序号", "班级", "*学生姓名", "*身份证号", "生日", "年龄", "* 手机"],
    [1, className, "学生二", virtualResidentId("20140101", "102"), "", "", virtualPhone("2102")],
  ])
}

async function conflictingGradeWorkbook(className: string): Promise<Buffer> {
  return workbookBuffer([
    ["序号", "班级", "*学生姓名", "*身份证号", "生日", "年龄", "* 手机"],
    [1, className, "学生二改", virtualResidentId("20140101", "102"), "", "", virtualPhone("2102")],
  ])
}

async function teacherWorkbook(className: string): Promise<Buffer> {
  return workbookBuffer([
    ["序号", "班级", "*教师姓名", "*身份证号", "生日", "年龄", "* 手机"],
    [1, className, "教师一", virtualResidentId("19800101", "103"), "", "", virtualPhone("2103")],
  ])
}

async function invalidGradeWorkbook(): Promise<Buffer> {
  return workbookBuffer([
    ["序号", "班级", "*学生姓名", "*身份证号", "生日", "年龄", "* 手机"],
    [1, "", "错误学生", "110101201401010000", "", "", virtualPhone("2104")],
  ])
}

async function workbookBuffer(rows: readonly (readonly unknown[])[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("数据导入项")
  sheet.addRow([])
  for (const row of rows) {
    sheet.addRow(row)
  }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

function restorePersonDataKey(value: string | undefined): void {
  if (value === undefined) {
    delete process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"]
    return
  }
  process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"] = value
}
