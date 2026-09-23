import { ForbiddenException } from "@nestjs/common"
import { describe, expect, it } from "vitest"
import {
  assertEvaluationPermission,
  filterSchoolConfirmedGrades,
  schoolReportRows,
} from "./evaluations.policy.js"
import type { EvaluationSummaryRow } from "./evaluations.types.js"

const rows: readonly EvaluationSummaryRow[] = [
  {
    personRef: "paid:line-a",
    displayName: "学生甲",
    organizationId: "school-a",
    gradeName: "五年级",
    className: "一班",
    gradeCode: "A",
    gradeLabel: "表现优秀",
    internalComment: "内部观察不可外发",
    excellent: true,
    attention: false,
    confirmedAt: "2026-09-23T00:00:00.000Z",
  },
  {
    personRef: "paid:line-b",
    displayName: "学生乙",
    organizationId: "school-b",
    gradeName: "五年级",
    className: "二班",
    gradeCode: "B",
    gradeLabel: "达到要求",
    internalComment: "跨校内部观察",
    excellent: false,
    attention: true,
    confirmedAt: "2026-09-23T00:00:00.000Z",
  },
  {
    personRef: "paid:line-c",
    displayName: "学生丙",
    organizationId: "school-a",
    gradeName: "五年级",
    className: "一班",
    gradeCode: null,
    gradeLabel: null,
    internalComment: "尚未确认",
    excellent: false,
    attention: false,
    confirmedAt: null,
  },
]

describe("evaluation policy", () => {
  it("returns only confirmed school-scope A/B rows without internal comments", () => {
    const result = filterSchoolConfirmedGrades(rows, "school-a")
    expect(result).toEqual([
      {
        personRef: "paid:line-a",
        displayName: "学生甲",
        gradeName: "五年级",
        className: "一班",
        gradeCode: "A",
        gradeLabel: "表现优秀",
      },
    ])
  })

  it("builds report rows from the same restricted school output", () => {
    expect(schoolReportRows(rows, "school-a")).toEqual([
      ["姓名", "年级", "班级", "等级", "等级说明"],
      ["学生甲", "五年级", "一班", "A", "表现优秀"],
    ])
  })

  it("does not allow parent access to student evaluations", () => {
    expect(() => assertEvaluationPermission({
      actorId: "family-a",
      kind: "family",
      permissionKeys: new Set(),
      scopes: [],
    }, "evaluations.read")).toThrow(ForbiddenException)
  })
})
