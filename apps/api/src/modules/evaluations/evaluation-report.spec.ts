import ExcelJS from "exceljs"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { createSchoolEvaluationWorkbook, createSchoolEvaluationWordXml } from "./evaluation-report.js"
import type { SchoolEvaluationRow } from "./evaluations.types.js"
import { filterSchoolConfirmedGrades } from "./evaluations.policy.js"

const rows: readonly SchoolEvaluationRow[] = [
  { personRef: "paid:line-a", displayName: "学生甲", gradeName: "五年级", className: "一班", gradeCode: "A", gradeLabel: "表现优秀" },
  { personRef: "paid:line-b", displayName: "学生乙", gradeName: "五年级", className: "一班", gradeCode: "B", gradeLabel: "达到要求" },
]

describe("school evaluation reports", () => {
  it("excludes ungraded students and internal negative observations from generated reports", async () => {
    const first = rows[0]
    if (first === undefined) throw new Error("report fixture missing")
    const internal = { ...first, id: "eval-a", version: 1, standardId: "std-a", organizationId: "school-a", internalComment: "内部负面记录不可外发", dimensionObservations: [{ code: "participation", observation: "内部逐项观察不可外发" }], excellent: false, attention: true, confirmedAt: "2026-09-27T00:00:00.000Z" }
    const output = filterSchoolConfirmedGrades([internal, { ...internal, id: "eval-b", personRef: "paid:line-c", displayName: "未评价学生", gradeCode: null, gradeLabel: null, confirmedAt: null }], "school-a")
    const buffer = await createSchoolEvaluationWorkbook(output)
    const workbook = new ExcelJS.Workbook()
    const arrayBuffer = new ArrayBuffer(buffer.length)
    new Uint8Array(arrayBuffer).set(buffer)
    await workbook.xlsx.load(arrayBuffer)
    const workbookText = JSON.stringify(workbook.getWorksheet("学校评价报告")?.getSheetValues())
    const wordText = createSchoolEvaluationWordXml(output, { title: "研学评价报告", templateNote: "基础格式" }).toString("utf8")
    for (const content of [workbookText, wordText]) {
      expect(content).toContain("学生甲")
      expect(content).not.toContain("内部负面记录不可外发")
      expect(content).not.toContain("内部逐项观察不可外发")
      expect(content).not.toContain("dimensionObservations")
      expect(content).not.toContain("未评价学生")
      expect(content).not.toContain("attention")
    }
  })
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
