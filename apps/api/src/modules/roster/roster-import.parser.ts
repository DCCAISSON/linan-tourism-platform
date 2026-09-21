import ExcelJS from "exceljs"
import { malformedRosterInput } from "./roster.errors.js"
import type { ParsedRosterImportRow, RosterImportTemplate } from "./roster-import.types.js"

type CellValue = ExcelJS.CellValue

const SHEET_NAME = "数据导入项"
const HEADER_ROW = 2
const HEADERS = {
  parent_child: ["序号", "班级", "*学生姓名", "*身份证号", "生日", "年龄", "*家长姓名", "*身份证号", "生日", "年龄", "* 手机"],
  grade_3_6: ["序号", "班级", "*学生姓名", "*身份证号", "生日", "年龄", "* 手机"],
  teacher: ["序号", "班级", "*教师姓名", "*身份证号", "生日", "年龄", "* 手机"],
} as const satisfies Record<RosterImportTemplate, readonly string[]>

export async function parseRosterImportWorkbook(buffer: Buffer, template: RosterImportTemplate): Promise<readonly ParsedRosterImportRow[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0])
  const worksheet = workbook.getWorksheet(SHEET_NAME)
  if (worksheet === undefined) {
    throw malformedRosterInput(`Excel 必须包含「${SHEET_NAME}」sheet`)
  }
  assertHeaders(worksheet, template)

  const rows: ParsedRosterImportRow[] = []
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= HEADER_ROW) {
      return
    }
    const parsed = parseDataRow(row, rowNumber, template)
    if (parsed !== null) {
      rows.push(parsed)
    }
  })
  return rows
}

function assertHeaders(worksheet: ExcelJS.Worksheet, template: RosterImportTemplate): void {
  const expected = HEADERS[template]
  const actual = expected.map((_, index) => cellText(worksheet.getRow(HEADER_ROW).getCell(index + 1).value))
  if (actual.some((value, index) => value !== expected[index])) {
    throw malformedRosterInput("Excel 表头与所选模板不一致")
  }
}

function parseDataRow(row: ExcelJS.Row, rowNumber: number, template: RosterImportTemplate): ParsedRosterImportRow | null {
  const className = cellText(row.getCell(2).value)
  if (template === "parent_child") {
    const studentName = cellText(row.getCell(3).value)
    const studentIdentity = cellText(row.getCell(4).value)
    const guardianName = cellText(row.getCell(7).value)
    const guardianIdentity = cellText(row.getCell(8).value)
    const phone = cellText(row.getCell(11).value)
    if (isEmptyDataRow([className, studentName, studentIdentity, guardianName, guardianIdentity, phone])) {
      return null
    }
    return {
      rowNumber,
      className,
      people: [
        { role: "student", displayName: studentName, identityNumber: studentIdentity, phone },
        { role: "guardian", displayName: guardianName, identityNumber: guardianIdentity, phone },
      ],
    }
  }

  const displayName = cellText(row.getCell(3).value)
  const identityNumber = cellText(row.getCell(4).value)
  const phone = cellText(row.getCell(7).value)
  if (isEmptyDataRow([className, displayName, identityNumber, phone])) {
    return null
  }
  return {
    rowNumber,
    className,
    people: [{ role: template === "teacher" ? "teacher" : "student", displayName, identityNumber, phone }],
  }
}

function isEmptyDataRow(values: readonly string[]): boolean {
  return values.every((value) => value.length === 0)
}

function cellText(value: CellValue): string {
  if (value === null || value === undefined) {
    return ""
  }
  if (typeof value === "string") {
    return value.trim()
  }
  if (typeof value === "number" || typeof value === "boolean" || value instanceof Date) {
    return String(value).trim()
  }
  if (typeof value === "object") {
    if ("result" in value) {
      return cellText(value.result as CellValue)
    }
    if ("text" in value && typeof value.text === "string") {
      return value.text.trim()
    }
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("").trim()
    }
  }
  return ""
}
