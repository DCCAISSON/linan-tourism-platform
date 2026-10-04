import ExcelJS from "exceljs"
import type { InsuranceExportKind } from "./insurance.types.js"
import type { InsuranceExportRow } from "./insurance.service.js"

export async function createInsuranceWorkbook(rows: readonly InsuranceExportRow[], kind: InsuranceExportKind): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "linan-tourism-platform"
  const sheet = workbook.addWorksheet(kind === "company_template" ? "保险公司模板" : "投保准备表")
  sheet.addRow(["姓名", "班级", "证件号码", "手机号", "投保状态", "保单号"])
  for (const row of rows) {
    sheet.addRow([row.name, row.className, row.identityNumber, row.phone, row.status, row.policyNumber])
  }
  sheet.columns.forEach((column) => { column.width = 18 })
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
