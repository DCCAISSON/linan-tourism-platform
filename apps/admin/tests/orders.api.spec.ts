// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { createStaffRefund, getStaffOrder, processStaffRefund } from "@/api/orders"

const detail = {
  id: "order-1", code: "ORDER-1", payerName: "家长甲", status: "paid", amountFen: 25600, paidFen: 25600,
  participantCount: 2, activityTitle: "研学", schoolName: "实验小学", startsAt: "2027-02-01T00:00:00Z", createdAt: "2026-09-22T00:00:00Z",
  contactName: "家长甲", contactPhone: "13800000000", emergencyContactName: null, emergencyContactPhone: null,
  refundSummary: { status: "partial", refundedFen: 12800, pendingFen: 0, failedCount: 0 },
  refundHistory: [{ id: "refund-1", status: "succeeded", amountFen: 12800, reason: "无法参加", note: null, requestedAt: "2026-09-22T00:00:00Z", processedAt: "2026-09-22T01:00:00Z", failureMessage: null, lines: [{ lineId: "line-1", displayName: "学生甲", amountFen: 12800 }] }],
  participants: [{ id: "line-1", displayName: "学生甲", gradeName: null, className: null, amountFen: 12800, refundedFen: 12800, refundStatus: "refunded" }],
}

describe("staff order refund response", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("retains refund summary, history and participant status when reading details", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(detail)))
    const result = await getStaffOrder("order-1")
    expect(result).toMatchObject(detail)
  })

  it.each([
    { ...detail, refundSummary: { ...detail.refundSummary, status: "unknown" } },
    { ...detail, refundSummary: { ...detail.refundSummary, refundedFen: -1 } },
    { ...detail, refundHistory: [{ ...detail.refundHistory[0], status: "unknown" }] },
    { ...detail, participants: [{ ...detail.participants[0], refundStatus: "unknown" }] },
  ])("rejects malformed refund data before showing it as valid business state", async value => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(value)))
    await expect(getStaffOrder("order-1")).rejects.toThrow("订单响应格式不正确")
  })

  it("sends selected lines, reason and idempotency key without client supplied money", async () => {
    const response = { ...detail.refundHistory[0], orderId: detail.id, status: "pending", processedAt: null }
    const fetchMock = vi.fn(async () => Response.json(response))
    vi.stubGlobal("fetch", fetchMock)
    const input = { lineIds: ["line-1"], reason: "无法参加", idempotencyKey: "request-1" }
    const result = await createStaffRefund("order-1", input)
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:3000/staff/orders/order-1/refunds", expect.objectContaining({ method: "POST", credentials: "include", body: JSON.stringify(input) }))
    expect(result.status).toBe("pending")
  })

  it("reports malformed local-result responses instead of claiming success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Gateway unavailable", { status: 502 })))
    await expect(processStaffRefund("order-1", "refund-1", "succeeded")).rejects.toThrow("订单服务响应格式不正确")
  })
})
