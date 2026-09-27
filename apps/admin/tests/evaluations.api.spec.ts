import { describe, expect, it } from "vitest"
import { parseEvaluationDashboard, parseSchoolReportResult } from "@/api/evaluations"

describe("admin evaluation API parser", () => {
  it("keeps internal observations separate from school grade output", () => {
    const dashboard = parseEvaluationDashboard({
      standards: [{ id: "std-a", tourSessionId: "session-a", title: "标准", confirmedAt: "2026-09-23T00:00:00.000Z", version: 1, items: [{ code: "A", label: "学校确认标签", description: "学校确认规则" }], dimensions: [{ code: "participation", label: "参与态度", description: "参与事实" }] }],
      organizationId: "school-a", students: [],
      evaluations: [{ id: "eval-a", version: 2, standardId: "std-a", personRef: "paid:line-a", displayName: "学生甲", organizationId: "school-a", gradeName: null, className: null, gradeCode: "A", gradeLabel: "优秀", internalComment: "内部观察", dimensionObservations: [{ code: "participation", observation: "主动完成记录任务" }], excellent: false, attention: false, confirmedAt: "2026-09-23T00:00:00.000Z" }],
    })
    expect(dashboard.evaluations[0]?.internalComment).toBe("内部观察")
    expect(dashboard.evaluations[0]).toMatchObject({ id: "eval-a", version: 2, standardId: "std-a" })
    expect(dashboard.standards[0]).toMatchObject({ dimensions: [{ code: "participation", label: "参与态度" }] })
    expect(dashboard.evaluations[0]).toMatchObject({ dimensionObservations: [{ code: "participation", observation: "主动完成记录任务" }] })
  })

  it("requires report exports to state their real format", () => {
    expect(parseSchoolReportResult({ filename: "report.xml", contentType: "application/msword", formatLabel: "Word XML 基础格式" })).toEqual({
      filename: "report.xml",
      contentType: "application/msword",
      formatLabel: "Word XML 基础格式",
    })
  })
})
