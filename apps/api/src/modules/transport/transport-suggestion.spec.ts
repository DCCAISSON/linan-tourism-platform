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

  it("keeps two three-person classes whole when two four-seat vehicles are available", () => {
    const travelers = [
      traveler("paid:a1", "class-a"), traveler("paid:a2", "class-a"), traveler("paid:a3", "class-a"),
      traveler("paid:b1", "class-b"), traveler("paid:b2", "class-b"), traveler("paid:b3", "class-b"),
    ]

    const suggestion = createTransportSuggestion({
      ...baseInput, reservedSeatsBySequence: {}, staffSeatsBySequence: {}, allowClassSplit: false, travelers,
    })

    expect(suggestion.kind).toBe("draft")
    expect(suggestion.assignments).toEqual(travelers.map((person) => ({
      personRef: person.personRef, sequence: person.classId === "class-a" ? 1 : 2,
    })))
  })

  it("reports a conflict without splitting a class when total seats cannot fit all whole classes", () => {
    const travelers = ["a", "b", "c"].flatMap((classId) =>
      [1, 2, 3].map((index) => traveler(`paid:${classId}${index}`, classId)))

    const suggestion = createTransportSuggestion({
      ...baseInput, availableSeatsBySequence: { 1: 5, 2: 5 },
      reservedSeatsBySequence: {}, staffSeatsBySequence: {}, allowClassSplit: false, travelers,
    })

    expect(suggestion.kind).toBe("conflict")
    expect(suggestion.assignments).toHaveLength(6)
    expect(suggestion.conflicts).toContain("当前整班分配未能安排全部人员，请调整车辆座位或人工安排；本建议不代表不存在其他可行方案。")
    expect(suggestion.assignments.filter((assignment) => assignment.sequence === 1)).toHaveLength(3)
    expect(suggestion.assignments.filter((assignment) => assignment.sequence === 2)).toHaveLength(3)
  })

  it("assigns unclassified people individually when class splitting is disabled", () => {
    const travelers = Array.from({ length: 6 }, (_, index) => traveler(`paid:${index}`, null))

    const suggestion = createTransportSuggestion({ ...baseInput, allowClassSplit: false, travelers })

    expect(suggestion.kind).toBe("draft")
    expect(suggestion.assignments).toEqual(travelers.map((person, index) => ({
      personRef: person.personRef, sequence: index < 2 ? 1 : 2,
    })))
  })

  it("groups interleaved class members before individuals and respects effective capacities", () => {
    const travelers = [
      traveler("paid:individual", null), traveler("paid:a1", "class-a"), traveler("paid:b1", "class-b"),
      traveler("paid:a2", "class-a"), traveler("imported:b2", "class-b"), traveler("paid:b3", "class-b"),
    ]

    const suggestion = createTransportSuggestion({ ...baseInput, allowClassSplit: false, travelers })

    expect(suggestion.kind).toBe("draft")
    expect(suggestion.assignments.map((assignment) => assignment.personRef).sort())
      .toEqual(travelers.map((person) => person.personRef).sort())
    expect(new Set(suggestion.assignments.map((assignment) => assignment.personRef)).size).toBe(6)
    for (const [sequence, capacity] of [[1, 2], [2, 4]]) {
      expect(suggestion.assignments.filter((assignment) => assignment.sequence === sequence).length).toBe(capacity)
    }
    for (const classId of ["class-a", "class-b"]) {
      const members = travelers.filter((person) => person.classId === classId)
      const sequences = suggestion.assignments.filter((assignment) =>
        members.some((member) => member.personRef === assignment.personRef)).map((assignment) => assignment.sequence)
      expect(new Set(sequences).size).toBe(1)
    }
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

function traveler(personRef: `paid:${string}` | `imported:${string}`, classId: string | null) {
  return { personRef, classId }
}
