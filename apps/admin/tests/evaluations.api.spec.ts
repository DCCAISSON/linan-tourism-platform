import { describe, expect, it } from "vitest"
import { parseEvaluationDashboard, parseSchoolReportResult } from "@/api/evaluations"

describe("admin evaluation API parser", () => {
  it("keeps internal observations separate from school grade output", () => {
    const dashboard = parseEvaluationDashboard({
      standards: [{ id: "std-a", tourSessionId: "session-a", title: "标准", confirmedAt: "2026-09-23T00:00:00.000Z", version: 1 }],
      evaluations: [{ personRef: "paid:line-a", displayName: "学生甲", organizationId: "school-a", gradeName: null, className: null, gradeCode: "A", gradeLabel: "优秀", internalComment: "内部观察", excellent: false, attention: false, confirmedAt: "2026-09-23T00:00:00.000Z" }],
    })
    expect(dashboard.evaluations[0]?.internalComment).toBe("内部观察")
  })

  it("requires report exports to state their real format", () => {
    expect(parseSchoolReportResult({ filename: "report.xml", contentType: "application/msword", formatLabel: "Word XML 基础格式" })).toEqual({
      filename: "report.xml",
      contentType: "application/msword",
      formatLabel: "Word XML 基础格式",
    })
  })
})
