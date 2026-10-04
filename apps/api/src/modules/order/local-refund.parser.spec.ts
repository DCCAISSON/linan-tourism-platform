import { describe, expect, it } from "vitest"
import { parseRefundSelection, parseRefundSimulation } from "./local-refund.parser.js"

describe("Local refund request boundary", () => {
  it("accepts trimmed stored line IDs when the quote body contains only a selection", () => {
    // Given
    const body = { lineIds: [" line-a ", "line-b"] }
    // When
    const result = parseRefundSelection(body)
    // Then
    expect(result).toEqual({ lineIds: ["line-a", "line-b"] })
  })

  it.each([
    null, [], { lineIds: "line-a" }, { lineIds: [1] }, { lineIds: [""] },
    { lineIds: ["a", " a "] }, { lineIds: ["a"], cancelledAt: "2026-01-01" },
    { lineIds: ["a"], paidFen: 1 }, { lineIds: ["a"], refundedFen: 1 },
    { lineIds: ["a"], reservedFen: 1 }, { lineIds: ["a"], compensationFen: 1 },
  ])("rejects malformed or additional quote inputs %j", (body) => {
    // When
    const action = () => parseRefundSelection(body)
    // Then
    expect(action).toThrowError(expect.objectContaining({ message: expect.any(String) }))
  })

  it.each(["succeeded", "failed"] as const)("accepts a local %s outcome when simulation is requested", (outcome) => {
    // Given
    const body = { lineIds: ["a"], outcome }
    // When
    const result = parseRefundSimulation(body)
    // Then
    expect(result).toEqual(body)
  })

  it.each([{ lineIds: ["a"] }, { lineIds: ["a"], outcome: "refunded" }, { lineIds: ["a"], outcome: "succeeded", amountFen: 1 }])("rejects invalid simulation controls %j", (body) => {
    // When
    const action = () => parseRefundSimulation(body)
    // Then
    expect(action).toThrowError(expect.objectContaining({ message: expect.any(String) }))
  })
})
