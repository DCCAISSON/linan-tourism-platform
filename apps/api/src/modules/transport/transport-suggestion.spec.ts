import { describe, expect, it } from "vitest"
import { createTransportSuggestion } from "./transport-suggestion.js"
import type { TransportSuggestionInput } from "./transport.types.js"

const baseInput: Omit<TransportSuggestionInput, "travelers"> = {
  availableSeatsBySequence: { 1: 4, 2: 4 },
  reservedSeatsBySequence: { 1: 1, 2: 0 },
  staffSeatsBySequence: { 1: 1, 2: 0 },
  keepFamilyTogether: false,
  allowClassSplit: true,
}

describe("createTransportSuggestion", () => {
  it("returns a draft and subtracts reserved and staff seats when proposing assignments", () => {
    const suggestion = createTransportSuggestion({
      ...baseInput,
      travelers: [
        traveler("paid:one", "class-1"),
        traveler("paid:two", "class-1"),
        traveler("imported:teacher", "class-1"),
      ],
    })

    expect(suggestion.kind).toBe("draft")
    expect(suggestion.assignments).toEqual([
      { personRef: "paid:one", sequence: 1 },
      { personRef: "paid:two", sequence: 1 },
      { personRef: "imported:teacher", sequence: 2 },
    ])
    expect(suggestion.explanations).toContain("1号车可用座位4，预留1，教师/导游占位1，实际可分配2。")
  })

  it("reports a conflict instead of guessing family relationships", () => {
    const suggestion = createTransportSuggestion({
      ...baseInput,
      keepFamilyTogether: true,
      travelers: [traveler("paid:one", "class-1")],
    })

    expect(suggestion.kind).toBe("conflict")
    expect(suggestion.conflicts).toContain("当前人员计划缺少已确认家庭关系，不能自动执行亲子同车规则。")
  })

  it("reports a conflict when class split is disabled and one class exceeds a vehicle", () => {
    const suggestion = createTransportSuggestion({
      ...baseInput,
      availableSeatsBySequence: { 1: 2, 2: 2 },
      allowClassSplit: false,
      travelers: [
        traveler("paid:one", "class-1"),
        traveler("paid:two", "class-1"),
        traveler("paid:three", "class-1"),
      ],
    })

    expect(suggestion.kind).toBe("conflict")
    expect(suggestion.conflicts).toContain("class-1班级3人超过单车最大可用座位2，且当前设置不允许拆班。")
  })
})

function traveler(personRef: `paid:${string}` | `imported:${string}`, classId: string) {
  return { personRef, classId }
}
