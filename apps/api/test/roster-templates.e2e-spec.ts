import ExcelJS from "exceljs"
import { Readable } from "node:stream"
import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createCatalogTripApp, DEV_ADMIN_HEADERS } from "./catalog-trip-fixture.js"
import { collectBinary } from "./roster-export-fixture.js"
import { parseRosterImportWorkbook } from "../src/modules/roster/roster-import.parser.js"
import { virtualPhone, virtualResidentId } from "./enrollment-consent-fixture.js"

const templates = ["parent_child", "grade_3_6", "teacher"] as const

describe("roster template downloads", () => {
  let app: INestApplication
  beforeAll(async () => { app = await createCatalogTripApp() })
  afterAll(async () => { await app.close() })

  it.each(templates)("downloads an empty original %s workbook retaining formulas and required headers", async template => {
    // Given / When
    const response = await request(app.getHttpServer()).get(`/roster/templates/${template}.xlsx`)
      .set(DEV_ADMIN_HEADERS).buffer(true).parse(collectBinary).expect(200)
    // Then
    expect(response.headers["content-type"]).toContain("spreadsheetml.sheet")
    expect(response.headers["content-disposition"]).toContain("attachment;")
    const buffer: unknown = response.body
    expect(Buffer.isBuffer(buffer)).toBe(true)
    if (!Buffer.isBuffer(buffer)) throw new Error("Expected XLSX buffer")
    await expect(parseRosterImportWorkbook(buffer, template)).resolves.toEqual([])
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.read(Readable.from(buffer))
    const sheet = workbook.getWorksheet("数据导入项")
    if (sheet === undefined) throw new Error("Missing import worksheet")
    expect(sheet.rowCount).toBe(58)
    expect(sheet.getCell("E3").formula).toBeTruthy()
    expect(sheet.getCell("F3").formula).toContain("TODAY")
    expect(sheet.getCell("C2").text).toBe(template === "teacher" ? "*教师姓名" : "*学生姓名")
    expect(sheet.getCell("B2").fill).toMatchObject({ type: "pattern" })
    expect(sheet.columnCount).toBe(template === "parent_child" ? 11 : 7)
  })

  it.each(templates)("parses synthetic rows entered into downloaded %s workbook", async template => {
    // Given
    const response = await request(app.getHttpServer()).get(`/roster/templates/${template}.xlsx`)
      .set(DEV_ADMIN_HEADERS).buffer(true).parse(collectBinary).expect(200)
    const buffer: unknown = response.body
    if (!Buffer.isBuffer(buffer)) throw new Error("Expected XLSX buffer")
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.read(Readable.from(buffer))
    const sheet = workbook.getWorksheet("数据导入项")
    if (sheet === undefined) throw new Error("Missing import worksheet")
    sheet.getCell("B3").value = "一班"
    sheet.getCell("C3").value = "校验人员"
    sheet.getCell("D3").value = virtualResidentId("20160101", "031")
    const phone = virtualPhone("9031")
    sheet.getCell(template === "parent_child" ? "K3" : "G3").value = phone
    if (template === "parent_child") {
      sheet.getCell("G3").value = "校验家长"
      sheet.getCell("H3").value = virtualResidentId("19860101", "032")
    }
    // When
    const rows = await parseRosterImportWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()), template)
    // Then
    expect(rows).toHaveLength(1)
    expect(rows[0]?.people).toHaveLength(template === "parent_child" ? 2 : 1)
    expect(rows[0]?.people[0]).toMatchObject({ displayName: "校验人员", phone })
  })

  it("rejects downloads when not authenticated", async () => {
    await request(app.getHttpServer()).get("/roster/templates/teacher.xlsx").expect(401)
  })

  it("rejects downloads when staff lack roster import permission", async () => {
    await request(app.getHttpServer()).get("/roster/templates/teacher.xlsx")
      .set({ "x-linan-dev-staff-id": "finance-template", "x-linan-dev-staff-role": "finance" }).expect(403)
  })

  it("rejects an unknown template instead of using arbitrary file paths", async () => {
    await request(app.getHttpServer()).get("/roster/templates/unknown.xlsx").set(DEV_ADMIN_HEADERS).expect(400)
  })
})
