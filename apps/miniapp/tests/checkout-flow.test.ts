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
  activeNoticeId: "notice-checkout-v1",
  activeNotice: {
    id: "notice-checkout-v1",
    organizationId: "org-school-1",
    tourSessionId: "session-1",
    version: "v1",
    title: "[演示]大明山地质研学告知书 v1",
    createdAt: "2026-09-22T00:00:00.000Z",
    contentJson: {
      destination: "[演示]大明山地质研学",
      departurePlace: "[演示]临安旅游集散中心门口",
      mealNote: "[演示]含午餐，特殊餐食由家长提前备注",
      itinerary: ["[演示]1", "[演示]2", "[演示]3", "[演示]4", "[演示]5", "[演示]6", "[演示]7"],
      unitPrices: ["[演示]学生195元/人", "[演示]成人195元/人"],
      packageExamples: ["[演示]1名学生+1名成人390元"],
      reminders: ["[演示]请携带身份证件"],
    },
  },
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
