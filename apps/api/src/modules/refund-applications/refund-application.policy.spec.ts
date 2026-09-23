import { describe, expect, it } from "vitest"
import { assertApplicationTransition, parseApplicationInput, parseExecuteInput, parseReviewInput } from "./refund-application.policy.js"

describe("refund application boundaries", () => {
  it("rejects family-supplied money when submitting selected people", () => {
    // Given
    const body = { lineIds: ["line-a"], reason: "行程调整", idempotencyKey: "request-a", amountFen: 1 }
    // When / Then
    expect(() => parseApplicationInput(body)).toThrow()
  })

  it("accepts only the family selection, reason and replay key", () => {
    // Given
    const body = { lineIds: ["line-a"], reason: " 行程调整 ", idempotencyKey: "request-a" }
    // When
    const result = parseApplicationInput(body)
    // Then
    expect(result).toEqual({ lineIds: ["line-a"], reason: "行程调整", note: null, idempotencyKey: "request-a" })
  })

  it.each(["approved", "rejected", "cancelled"] as const)("prevents family withdrawal when status is %s", (status) => {
    // Given / When / Then
    expect(() => assertApplicationTransition(status, "cancelled")).toThrow()
  })

  it("requires a reason when reviewing an application", () => {
    // Given / When / Then
    expect(() => parseReviewInput({ decision: "rejected", reason: " " })).toThrow()
  })

  it("prevents approval from directly becoming execution", () => {
    // Given / When / Then
    expect(() => assertApplicationTransition("approved", "approved")).toThrow()
  })

  it("parses local execution without accepting unrelated fields", () => {
    // Given / When
    const result = parseExecuteInput({ outcome: "failed", failureMessage: " 本地退款失败 " })
    // Then
    expect(result).toEqual({ outcome: "failed", failureMessage: "本地退款失败" })
    expect(() => parseExecuteInput({ outcome: "succeeded", amountFen: 1 })).toThrow()
  })
})
