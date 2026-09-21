import ExcelJS from "exceljs"
import { describe, expect, it } from "vitest"
import { parseRosterImportWorkbook } from "../src/modules/roster/roster-import.parser.js"
import { virtualPhone, virtualResidentId } from "./enrollment-consent-fixture.js"

const sheetName = "数据导入项"

describe("roster import workbook parser", () => {
  it("maps the returned parent-child template and ignores sequence-only placeholder rows", async () => {
    const buffer = await workbookBuffer([
      ["序号", "班级", "*学生姓名", "*身份证号", "生日", "年龄", "*家长姓名", "*身份证号", "生日", "年龄", "* 手机"],
      [1, "一（1）班", "学生一", virtualResidentId("20160101", "001"), "", "", "家长一", virtualResidentId("19860101", "001"), "", "", virtualPhone("1101")],
      [2, "", "", "", "", "", "", "", "", "", ""],
    ])

    await expect(parseRosterImportWorkbook(buffer, "parent_child")).resolves.toEqual([
      {
        rowNumber: 3,
        className: "一（1）班",
        people: [
          { role: "student", displayName: "学生一", identityNumber: virtualResidentId("20160101", "001"), phone: virtualPhone("1101") },
          { role: "guardian", displayName: "家长一", identityNumber: virtualResidentId("19860101", "001"), phone: virtualPhone("1101") },
        ],
      },
    ])
  })

  it("maps the returned grade 3-6 and teacher templates", async () => {
    const studentBuffer = await workbookBuffer([
      ["序号", "班级", "*学生姓名", "*身份证号", "生日", "年龄", "* 手机"],
      [1, "三（2）班", "学生二", virtualResidentId("20140101", "002"), "", "", virtualPhone("1102")],
    ])
    const teacherBuffer = await workbookBuffer([
      ["序号", "班级", "*教师姓名", "*身份证号", "生日", "年龄", "* 手机"],
      [1, "带队教师", "教师一", virtualResidentId("19800101", "003"), "", "", virtualPhone("1103")],
    ])

    await expect(parseRosterImportWorkbook(studentBuffer, "grade_3_6")).resolves.toEqual([
      {
        rowNumber: 3,
        className: "三（2）班",
        people: [{ role: "student", displayName: "学生二", identityNumber: virtualResidentId("20140101", "002"), phone: virtualPhone("1102") }],
      },
    ])
    await expect(parseRosterImportWorkbook(teacherBuffer, "teacher")).resolves.toEqual([
      {
        rowNumber: 3,
        className: "带队教师",
        people: [{ role: "teacher", displayName: "教师一", identityNumber: virtualResidentId("19800101", "003"), phone: virtualPhone("1103") }],
      },
    ])
  })

  it("rejects a mismatched selected template", async () => {
    const buffer = await workbookBuffer([
      ["序号", "班级", "*教师姓名", "*身份证号", "生日", "年龄", "* 手机"],
    ])

    await expect(parseRosterImportWorkbook(buffer, "grade_3_6")).rejects.toThrow("Excel 表头与所选模板不一致")
  })
})

async function workbookBuffer(rows: readonly (readonly unknown[])[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(sheetName)
  sheet.addRow([])
  for (const row of rows) {
    sheet.addRow(row)
  }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
