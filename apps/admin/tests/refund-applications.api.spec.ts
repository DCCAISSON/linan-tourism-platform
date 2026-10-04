// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { executeRefundApplication, listRefundApplications, reviewRefundApplication } from "@/api/refund-applications"

const application = {
  id: "app-1",
  orderId: "order-1",
  status: "submitted",
  reason: "行程调整",
  amountFen: 12800,
  lines: [{ lineId: "line-1", displayName: "学生甲", amountFen: 12800 }],
  submittedAt: "2026-09-23T00:00:00.000Z",
  updatedAt: "2026-09-23T00:00:00.000Z",
  reviewReason: null,
  reviewedAt: null,
  refundRequestId: null,
  refundStatus: null,
}

describe("refund applications API", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("lists staff refund applications without treating approval as execution", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([{ ...application, status: "approved" }])))
    const result = await listRefundApplications("approved")
    expect(result[0]).toEqual({ ...application, status: "approved" })
  })

  it("sends review decisions to the review endpoint", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ...application, status: "approved", reviewReason: "情况属实" }))
    vi.stubGlobal("fetch", fetchMock)
    await reviewRefundApplication("app-1", "approved", "情况属实")
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:3000/staff/refund-applications/app-1/review", expect.objectContaining({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ decision: "approved", reason: "情况属实" }),
    }))
  })

  it("submits approved applications to the execution endpoint", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ...application, status: "approved", refundRequestId: "refund-1", refundStatus: "pending" }))
    vi.stubGlobal("fetch", fetchMock)
    const result = await executeRefundApplication("app-1")
    expect(result.refundStatus).toBe("pending")
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:3000/staff/refund-applications/app-1/execute", expect.objectContaining({
      body: JSON.stringify({ outcome: "succeeded", failureMessage: null }),
    }))
  })

  it("rejects malformed response states", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([{ ...application, status: "succeeded" }])))
    await expect(listRefundApplications()).rejects.toThrow("退款申请响应格式不正确")
  })
})
