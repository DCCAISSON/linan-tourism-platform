import { describe, expect, it } from "vitest"
import {
  parseBatchEvaluation,
  parseEvaluationStandard,
  parseEvaluationRevision,
  parseStandardConfirmation,
} from "./evaluations.parser.js"

describe("evaluation parser", () => {
  const draft = {
    tourSessionId: "session-a", title: "观察规则",
    items: [{ code: "A", label: "优秀", description: "学校A规则" }, { code: "B", label: "合格", description: "学校B规则" }],
    publicFormatNote: "仅输出确认等级",
  }

  it.each(["A", "B"])("rejects an unapproved %s label when creating a new standard", (code) => {
    expect(() => parseEvaluationStandard({ ...draft, items: draft.items.map((item) => item.code === code ? { ...item, label: "自定义名称" } : item) })).toThrow("新建标准的等级名称须为 A=优秀、B=合格")
  })

  it("accepts optional observation dimensions without assigning a grade or score", () => {
    const dimensions = [{ code: "participation", label: "参与态度", description: "记录参与学习的具体表现" }]
    expect(parseEvaluationStandard({ ...draft, dimensions })).toMatchObject({ dimensions })
  })

  it("rejects duplicate dimension codes in a standard", () => {
    const dimension = { code: "participation", label: "参与态度", description: "观察事实" }
    expect(() => parseEvaluationStandard({ ...draft, dimensions: [dimension, dimension] })).toThrow(/duplicate dimension/)
  })

  it("accepts per-dimension observations without assigning an A/B grade", () => {
    const dimensionObservations = [{ code: "participation", observation: "主动完成小组分配的记录任务" }]
    expect(parseBatchEvaluation({ tourSessionId: "session-a", standardId: "std-a", idempotencyKey: "observe-a", observations: [{ personRef: "paid:line-a", internalComment: "", excellent: false, attention: false, gradeCode: null, dimensionObservations }] }).observations[0]).toMatchObject({ gradeCode: null, dimensionObservations })
  })

  it("rejects duplicate observations in an individual revision", () => {
    const observation = { code: "participation", observation: "观察事实" }
    expect(() => parseEvaluationRevision({ expectedVersion: 1, internalComment: "", excellent: false, attention: false, gradeCode: null, dimensionObservations: [observation, observation] })).toThrow(/duplicate dimension/)
  })
  it("accepts a standard draft with explicit A and B labels", () => {
    const result = parseEvaluationStandard({
      tourSessionId: "session-a",
      title: "研学表现等级",
      items: [
        { code: "A", label: "优秀", description: "主动协作并完成任务" },
        { code: "B", label: "合格", description: "完成主要活动" },
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
