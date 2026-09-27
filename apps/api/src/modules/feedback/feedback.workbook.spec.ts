import ExcelJS from "exceljs"
import { Readable } from "node:stream"
import { describe, expect, it } from "vitest"
import { buildFeedbackWorkbook } from "./feedback.workbook.js"

describe("internal feedback workbook", () => {
  it("exports filtered summary and details as literal text without identity columns", async () => {
    const bytes = await buildFeedbackWorkbook({ sessionName: "=课程 / 学校", filters: { source: "school", status: "rejected", rating: 3 }, items: [{ id: "private-id", tourSessionId: "session", organizationId: "org", source: "school", status: "rejected", rating: 3, content: '=HYPERLINK("x")', publicExcerpt: "", allowPublic: false, version: 1 }] })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.read(Readable.from(bytes))
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(["汇总", "明细"])
    const summary = workbook.getWorksheet("汇总")
    expect(summary?.getCell("B1").value).toBe("内部使用，含原反馈")
    expect(summary?.getCell("B6").value).toBe(1)
    expect(summary?.getCell("B7").value).toBe(0)
    expect(summary?.getCell("B8").value).toBe(3)
    const details = workbook.getWorksheet("明细")
    expect(details?.getRow(1).values).toEqual([undefined, "团期", "来源", "评分", "状态", "同意公开", "原反馈", "审核摘要"])
    expect(details?.getCell("F2").value).toBe('=HYPERLINK("x")')
    expect(details?.getCell("F2").type).toBe(ExcelJS.ValueType.String)
    expect(JSON.stringify(workbook.model)).not.toContain("private-id")
  })
})
