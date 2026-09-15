import { PAYMENT_STATUS } from "@linan/contracts"
import { describe, expect, it } from "vitest"
import { reduceMockPaymentStatus } from "./payment-state.js"

describe("reduceMockPaymentStatus", () => {
  it("lets a successful event promote a previously failed payment", () => {
    // Given
    const current = PAYMENT_STATUS.failed

    // When
    const next = reduceMockPaymentStatus(current, "succeeded")

    // Then
    expect(next).toBe(PAYMENT_STATUS.succeeded)
  })

  it("does not let a delayed failed event replace success", () => {
    // Given
    const current = PAYMENT_STATUS.succeeded

    // When
    const next = reduceMockPaymentStatus(current, "failed")

    // Then
    expect(next).toBe(PAYMENT_STATUS.succeeded)
  })

  it("records a failed event while payment is pending", () => {
    // Given
    const current = PAYMENT_STATUS.pending

    // When
    const next = reduceMockPaymentStatus(current, "failed")

    // Then
    expect(next).toBe(PAYMENT_STATUS.failed)
  })
})
