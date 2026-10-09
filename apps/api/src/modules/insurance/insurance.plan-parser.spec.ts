import { BadRequestException } from "@nestjs/common"
import { describe, expect, it } from "vitest"
import { parseInsurancePlan } from "./insurance.parser.js"

const plan = { insurerName: "测试保险公司", planName: "测试方案", coverageSummary: "意外伤害保障10万元", notice: null }

describe("insurance plan input", () => {
  it("normalizes whitespace and blank optional notice when saving a plan", () => {
    // Given
    const input = { plan: { ...plan, insurerName: "  测试保险公司  ", notice: "   " } }
    // When
    const actual = parseInsurancePlan(input)
    // Then
    expect(actual).toEqual(plan)
  })

  it("accepts explicit null when clearing the current plan", () => {
    // Given
    const input = { plan: null }
    // When
    const actual = parseInsurancePlan(input)
    // Then
    expect(actual).toBeNull()
  })

  it("applies text limits after trimming surrounding whitespace", () => {
    // Given
    const trimmed = { insurerName: "甲".repeat(120), planName: "乙".repeat(120), coverageSummary: "丙".repeat(4000), notice: "丁".repeat(2000) }
    const input = { plan: Object.fromEntries(Object.entries(trimmed).map(([key, value]) => [key, `  ${value}  `])) }
    // When
    const actual = parseInsurancePlan(input)
    // Then
    expect(actual).toEqual(trimmed)
  })

  it.each([
    {}, { plan: [] }, { plan: { ...plan, insurerName: " " } },
    { plan: { ...plan, planName: " " } }, { plan: { ...plan, coverageSummary: " " } },
    { plan: { ...plan, insurerName: "a".repeat(121) } },
    { plan: { ...plan, planName: "a".repeat(121) } },
    { plan: { ...plan, coverageSummary: "a".repeat(4001) } },
    { plan: { ...plan, notice: "a".repeat(2001) } },
    { plan: { ...plan, extra: "unexpected" } }, { plan, extra: true },
  ])("rejects malformed or unknown plan fields in case %#", (input) => {
    // Given
    const parse = () => parseInsurancePlan(input)
    // Then
    expect(parse).toThrow(BadRequestException)
  })
})
