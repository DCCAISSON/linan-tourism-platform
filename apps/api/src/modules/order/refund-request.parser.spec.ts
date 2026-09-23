import { describe, expect, it } from "vitest"
import { parseStaffRefundRequest, parseStaffRefundResult } from "./refund-request.parser.js"

describe("Staff refund request boundary", () => {
  it("accepts stored line IDs with a reason, note, and idempotency key", () => {
    // Given
    const body = {
      lineIds: [" line-a ", "line-b"],
      reason: "parent cancellation",
      note: "called front desk",
      idempotencyKey: "refund-key-1",
    }
    // When
    const result = parseStaffRefundRequest(body)
    // Then
    expect(result).toEqual({
      lineIds: ["line-a", "line-b"],
      reason: "parent cancellation",
      note: "called front desk",
      idempotencyKey: "refund-key-1",
    })
  })

  it.each([
    { lineIds: ["a"], reason: "r", idempotencyKey: "k", amountFen: 1 },
    { lineIds: ["a"], reason: "r", idempotencyKey: "k", refundedFen: 1 },
    { lineIds: ["a"], idempotencyKey: "k" },
    { lineIds: ["a"], reason: " ", idempotencyKey: "k" },
    { lineIds: ["a"], reason: "r", idempotencyKey: " " },
    { lineIds: ["a", " a "], reason: "r", idempotencyKey: "k" },
  ])("rejects malformed or monetary staff refund inputs %j", (body) => {
    // When
    const action = () => parseStaffRefundRequest(body)
    // Then
    expect(action).toThrowError(expect.objectContaining({ message: expect.any(String) }))
  })

  it.each(["succeeded", "failed"] as const)("accepts a local %s processing result", (outcome) => {
    // Given
    const body = { outcome, failureMessage: outcome === "failed" ? "provider rejected" : undefined }
    // When
    const result = parseStaffRefundResult(body)
    // Then
    expect(result).toEqual({ outcome, failureMessage: body.failureMessage ?? null })
  })

  it.each([
    {},
    { outcome: "pending" },
    { outcome: "succeeded", amountFen: 1 },
    { outcome: "failed", failureMessage: "" },
  ])("rejects invalid local processing controls %j", (body) => {
    // When
    const action = () => parseStaffRefundResult(body)
    // Then
    expect(action).toThrowError(expect.objectContaining({ message: expect.any(String) }))
  })
})
