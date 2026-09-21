import { describe, expect, it } from "vitest"
import {
  DOMAIN_ERROR_CODE,
  DOMAIN_ENTITY_CONTRACTS,
  DOMAIN_ENTITY_KIND,
  DOMAIN_POLICY_VERSION,
  HEALTH_STATUS,
  ORDER_STATUS,
  PAYMENT_STATUS,
  makeCnyFen,
  transitionPaymentStatus,
  transitionOrderStatus,
  type HealthResponse,
} from "./index.js"

describe("health contract", () => {
  it("allows the API health response shape", () => {
    const response: HealthResponse = {
      status: HEALTH_STATUS.ok,
      service: "@linan/api",
      revision: "test-revision",
    }

    expect(response.status).toBe("ok")
  })

  it("returns a typed amount error when CNY fen is negative", () => {
    const result = makeCnyFen(-1)

    expect(result).toEqual({
      ok: false,
      error: {
        code: DOMAIN_ERROR_CODE.invalidMoneyAmount,
        message: "money amount must be a non-negative integer number of fen",
        policyVersion: DOMAIN_POLICY_VERSION,
      },
    })
  })

  it("returns a typed state error when a paid order returns to pending payment", () => {
    const result = transitionOrderStatus(ORDER_STATUS.paid, ORDER_STATUS.pendingPayment)

    expect(result).toEqual({
      ok: false,
      error: {
        code: DOMAIN_ERROR_CODE.invalidStateTransition,
        message: "order status cannot move from paid to pending_payment",
        policyVersion: DOMAIN_POLICY_VERSION,
      },
    })
  })

  it("uses enrollment as the registration contract name", () => {
    expect(DOMAIN_ENTITY_KIND.enrollment).toBe("enrollment")
  })

  it("publishes family member and enrollment participant entity contracts", () => {
    expect(DOMAIN_ENTITY_CONTRACTS.map(({ tableName }) => tableName)).toEqual(
      expect.arrayContaining([
        "families",
        "family_members",
        "school_grades",
        "school_classes",
        "enrollment_participants",
      ]),
    )
    expect(DOMAIN_ENTITY_KIND.familyMember).toBe("family_member")
    expect(DOMAIN_ENTITY_KIND.enrollmentParticipant).toBe("enrollment_participant")
  })

  it("publishes participant order line and payment event entity contracts", () => {
    expect(DOMAIN_ENTITY_CONTRACTS.map(({ tableName }) => tableName)).toEqual(
      expect.arrayContaining(["order_lines", "payment_events"]),
    )
    expect(DOMAIN_ENTITY_KIND.orderLine).toBe("order_line")
    expect(DOMAIN_ENTITY_KIND.paymentEvent).toBe("payment_event")
  })

  it("returns a typed state error when a succeeded payment returns to pending", () => {
    const result = transitionPaymentStatus(PAYMENT_STATUS.succeeded, PAYMENT_STATUS.pending)

    expect(result).toEqual({
      ok: false,
      error: {
        code: DOMAIN_ERROR_CODE.invalidStateTransition,
        message: "payment status cannot move from succeeded to pending",
        policyVersion: DOMAIN_POLICY_VERSION,
      },
    })
  })

  it("allows a failed payment to recover when a later provider event succeeds", () => {
    // Given
    const current = PAYMENT_STATUS.failed

    // When
    const result = transitionPaymentStatus(current, PAYMENT_STATUS.succeeded)

    // Then
    expect(result).toEqual({ ok: true, value: PAYMENT_STATUS.succeeded })
  })
})
