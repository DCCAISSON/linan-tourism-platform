import { describe, expect, it } from "vitest"
import {
  parseBatchEvaluation,
  parseEvaluationStandard,
  parseEvaluationRevision,
  parseStandardConfirmation,
} from "./evaluations.parser.js"

describe("evaluation parser", () => {
  it("accepts a standard draft with explicit A and B labels", () => {
    const result = parseEvaluationStandard({
      tourSessionId: "session-a",
      title: "研学表现等级",
      items: [
        { code: "A", label: "表现优秀", description: "主动协作并完成任务" },
        { code: "B", label: "达到要求", description: "完成主要活动" },
      ],
      publicFormatNote: "基础格式，未取得正式模板",
    })
    expect(result.items.map((item) => item.code)).toEqual(["A", "B"])
  })

  it("rejects a confirmed standard without both A and B labels", () => {
    expect(parseStandardConfirmation({ expectedVersion: 1, confirmed: true })).toEqual({ expectedVersion: 1, confirmed: true })
    expect(() => parseEvaluationStandard({
      tourSessionId: "session-a",
      title: "研学表现等级",
      items: [{ code: "A", label: "优秀", description: "优秀" }],
      publicFormatNote: "基础格式",
    })).toThrow(/A\/B/)
  })

  it("accepts internal observations without a grade", () => {
    const result = parseBatchEvaluation({
      tourSessionId: "session-a",
      standardId: null,
      observations: [
        { personRef: "paid:line-a", internalComment: "愿意帮助同学", excellent: true, attention: false, gradeCode: null },
      ],
      idempotencyKey: "request-a",
    })
    expect(result.observations[0]).toMatchObject({ gradeCode: null, excellent: true })
  })

  it("rejects graded evaluation when no confirmed standard id is supplied", () => {
    expect(() => parseBatchEvaluation({
      tourSessionId: "session-a",
      standardId: null,
      observations: [
        { personRef: "paid:line-a", internalComment: "表现稳定", excellent: false, attention: false, gradeCode: "A" },
      ],
      idempotencyKey: "request-a",
    })).toThrow(/standard/)
  })

  it("parses a single-person revision without client controlled visibility", () => {
    const result = parseEvaluationRevision({
      expectedVersion: 2,
      internalComment: "修订后的内部观察",
      excellent: false,
      attention: true,
      gradeCode: "B",
    })
    expect(result).toMatchObject({ expectedVersion: 2, gradeCode: "B", attention: true })
  })
})
