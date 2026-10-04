import ExcelJS from "exceljs"
import type { SchoolEvaluationRow } from "./evaluations.types.js"

const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"] as const

export async function createSchoolEvaluationWorkbook(rows: readonly SchoolEvaluationRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "linan-api"
  const sheet = workbook.addWorksheet("学校评价报告")
  sheet.columns = [
    { header: "姓名", key: "displayName", width: 18 },
    { header: "年级", key: "gradeName", width: 16 },
    { header: "班级", key: "className", width: 16 },
    { header: "等级", key: "gradeCode", width: 10 },
    { header: "等级说明", key: "gradeLabel", width: 24 },
  ]
  for (const row of rows) {
    sheet.addRow({
      displayName: neutralize(row.displayName),
      gradeName: neutralize(row.gradeName ?? ""),
      className: neutralize(row.className ?? ""),
      gradeCode: row.gradeCode,
      gradeLabel: neutralize(row.gradeLabel),
    })
  }
  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
}

export function createSchoolEvaluationWordXml(rows: readonly SchoolEvaluationRow[], options: { readonly title: string; readonly templateNote: string }): Buffer {
  const body = rows.map((row) => `<w:tr><w:tc><w:p><w:r><w:t>${xml(row.displayName)}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>${xml(row.gradeName ?? "")}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>${xml(row.className ?? "")}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>${row.gradeCode}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>${xml(row.gradeLabel)}</w:t></w:r></w:p></w:tc></w:tr>`).join("")
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:wordDocument xmlns:w="http://schemas.microsoft.com/office/word/2003/wordml">
<w:body>
<w:p><w:r><w:t>${xml(options.title)}</w:t></w:r></w:p>
<w:p><w:r><w:t>${xml(options.templateNote)}</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>姓名</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>年级</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>班级</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>等级</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>等级说明</w:t></w:r></w:p></w:tc></w:tr>${body}</w:tbl>
</w:body>
</w:wordDocument>`, "utf8")
}

function neutralize(value: string): string {
  return FORMULA_PREFIXES.some((prefix) => value.startsWith(prefix)) ? `'${value}` : value
}

function xml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}
