import { DOMAIN_POLICY_VERSION } from "@linan/contracts"
import { describe, expect, it } from "vitest"
import {
  buildCreateOrderPayload,
  nextPageModeForOrder,
  readTripGate,
} from "../src/checkout-flow"
import type { Order, TourSession } from "../src/api"

const publishedSession: TourSession = {
  id: "session-1",
  organizationId: "org-school-1",
  catalogItemId: "catalog-1",
  code: "session-1",
  status: "published",
  priceFen: 12_300,
  capacity: 30,
  startsAt: "2026-10-03T01:00:00.000Z",
  endsAt: "2026-10-03T09:00:00.000Z",
  enrollmentOpensAt: "2026-09-20T01:00:00.000Z",
  enrollmentClosesAt: "2026-10-01T09:00:00.000Z",
  policyVersion: DOMAIN_POLICY_VERSION,
}

const pendingOrder: Order = {
  id: "order-1",
  code: "ORDER-1",
  enrollmentId: "enrollment-1",
  status: "pending_payment",
  amountFen: 24_600,
  paidFen: 0,
  payerName: "测试家长",
  participantCount: 2,
}

describe("checkout flow", () => {
  it("builds an authoritative order payload when enrollment is submitted", () => {
    // Given
    const enrollmentId = "enrollment-1"

    // When
    const payload = buildCreateOrderPayload(enrollmentId, " 测试家长 ", "order-request-1")

    // Then
    expect(payload).toEqual({
      enrollmentId,
      payerName: "测试家长",
      requestIdempotencyKey: "order-request-1",
    })
    expect(payload).not.toHaveProperty("amountFen")
    expect(payload).not.toHaveProperty("paidFen")
  })

  it("keeps review disabled when the selected trip is closed", () => {
    // Given
    const closedSession: TourSession = {
      ...publishedSession,
      status: "closed",
    }

    // When
    const gate = readTripGate(closedSession, "2026-09-15T01:00:00.000Z")

    // Then
    expect(gate).toEqual({ open: false, reason: "报名已关闭" })
  })

  it("moves from payment pending to paid after a refreshed order is paid", () => {
    // Given
    const paidOrder: Order = { ...pendingOrder, status: "paid", paidFen: pendingOrder.amountFen }

    // When
    const pendingMode = nextPageModeForOrder(pendingOrder)
    const paidMode = nextPageModeForOrder(paidOrder)

    // Then
    expect(pendingMode).toBe("paymentPending")
    expect(paidMode).toBe("paid")
  })
})
