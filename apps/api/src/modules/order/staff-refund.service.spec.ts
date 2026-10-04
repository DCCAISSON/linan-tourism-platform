import { describe, expect, it } from "vitest"
import { assertRefundReplayMatches } from "./staff-refund.service.js"

describe("staff refund idempotency replay", () => {
  const input = {
    routeOrderId: "order-a",
    storedOrderId: "order-a",
    storedReason: "parent cancellation",
    storedNote: "called desk",
    storedLineIds: ["line-a", "line-b"],
    requestedReason: "parent cancellation",
    requestedNote: "called desk",
    requestedLineIds: ["line-b", "line-a"],
  } as const

  it("accepts replay of the same refund request for the same order", () => {
    // When
    const action = () => assertRefundReplayMatches(input)
    // Then
    expect(action).not.toThrow()
  })

  it("rejects reuse of the same idempotency key across another order", () => {
    // When
    const action = () => assertRefundReplayMatches({ ...input, routeOrderId: "order-b" })
    // Then
    expect(action).toThrowError(expect.objectContaining({ response: expect.objectContaining({ code: "idempotency_conflict" }) }))
  })

  it("rejects replay when the selected people or reason changed", () => {
    // When
    const action = () => assertRefundReplayMatches({ ...input, requestedLineIds: ["line-a"], requestedNote: null })
    // Then
    expect(action).toThrowError(expect.objectContaining({ response: expect.objectContaining({ code: "idempotency_conflict" }) }))
  })
})
