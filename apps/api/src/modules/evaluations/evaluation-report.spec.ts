import ExcelJS from "exceljs"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { createSchoolEvaluationWorkbook, createSchoolEvaluationWordXml } from "./evaluation-report.js"
import type { SchoolEvaluationRow } from "./evaluations.types.js"

const rows: readonly SchoolEvaluationRow[] = [
  { personRef: "paid:line-a", displayName: "学生甲", gradeName: "五年级", className: "一班", gradeCode: "A", gradeLabel: "表现优秀" },
  { personRef: "paid:line-b", displayName: "学生乙", gradeName: "五年级", className: "一班", gradeCode: "B", gradeLabel: "达到要求" },
]

describe("school evaluation reports", () => {
  it("creates an Excel workbook with the same confirmed grade counts", async () => {
    const buffer = await createSchoolEvaluationWorkbook(rows)
    await writeArtifact("school-evaluation-report.xlsx", buffer)
    const workbook = new ExcelJS.Workbook()
    const arrayBuffer = new ArrayBuffer(buffer.byteLength)
    new Uint8Array(arrayBuffer).set(buffer)
    await workbook.xlsx.load(arrayBuffer)
    const sheet = workbook.getWorksheet("学校评价报告")
    expect(sheet?.rowCount).toBe(3)
    expect(sheet?.getRow(2).values).toContain("A")
    expect(sheet?.getRow(3).values).toContain("B")
  })

  it("creates honest Word XML instead of a fake docx package", async () => {
    const buffer = createSchoolEvaluationWordXml(rows, { title: "研学评价报告", templateNote: "基础格式，未获得正式模板" })
    await writeArtifact("school-evaluation-report-basic-word-xml.doc", buffer)
    const xml = buffer.toString("utf8")
    expect(xml).toContain("<?xml version=\"1.0\"")
    expect(xml).toContain("基础格式，未获得正式模板")
    expect(xml).toContain("学生甲")
    expect(xml).not.toContain("PK")
  })
})

async function writeArtifact(fileName: string, buffer: Buffer): Promise<void> {
  const directory = process.env["EVALUATION_REPORT_ARTIFACT_DIR"]
  if (directory === undefined || directory.length === 0) return
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, fileName), buffer)
}
