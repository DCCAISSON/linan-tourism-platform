import { describe, expect, it } from "vitest"
import { ApiError } from "../src/api"
import { activeRefundApplicationLineIds, createRefundApplicationClient, parseRefundApplication } from "../src/refund-applications-api"
import type { MiniappRequestOptions } from "../src/api-types"

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

describe("family refund application API", () => {
  it("submits selected line ids and reason without client supplied money", async () => {
    const requests: MiniappRequestOptions[] = []
    const api = createRefundApplicationClient({
      baseUrl: "https://api.example.test",
      familyIdentityHeader: "family-a",
      wechatSessionToken: "session-a",
      request: async (options) => {
        requests.push(options)
        return { statusCode: 201, data: application }
      },
    })
    const result = await api.submitRefundApplication("order/a", { lineIds: ["line-1"], reason: "行程调整", idempotencyKey: "request-1" })
    expect(result).toEqual(application)
    expect(requests[0]).toEqual({
      url: "https://api.example.test/orders/order%2Fa/refund-applications",
      method: "POST",
      header: { "Content-Type": "application/json", "x-linan-dev-family-identity": "family-a", Authorization: "Bearer session-a" },
      data: { lineIds: ["line-1"], reason: "行程调整", idempotencyKey: "request-1" },
    })
  })

  it("lists and cancels only through the family order scoped endpoint", async () => {
    const paths: string[] = []
    const api = createRefundApplicationClient({
      baseUrl: "https://api.example.test",
      request: async (options) => {
        paths.push(options.url)
        return { statusCode: 200, data: options.method === "GET" ? [application] : { ...application, status: "cancelled" } }
      },
    })
    await expect(api.listRefundApplications("order-1")).resolves.toEqual([application])
    await expect(api.cancelRefundApplication("order-1", "app-1")).resolves.toEqual({ ...application, status: "cancelled" })
    expect(paths).toEqual([
      "https://api.example.test/orders/order-1/refund-applications",
      "https://api.example.test/orders/order-1/refund-applications/app-1/cancel",
    ])
  })

  it("rejects malformed application status", () => {
    expect(() => parseRefundApplication({ ...application, status: "succeeded" })).toThrow(new ApiError(0, "退款信息暂时无法读取，请稍后再试。"))
  })

  it("blocks lines only while an application is active and not yet executed", () => {
    const activeLineIds = activeRefundApplicationLineIds([
      parseRefundApplication(application),
      parseRefundApplication({ ...application, id: "app-2", status: "approved", lines: [{ ...application.lines[0], lineId: "line-2" }] }),
      parseRefundApplication({ ...application, id: "app-3", status: "approved", refundRequestId: "refund-3", refundStatus: "failed", lines: [{ ...application.lines[0], lineId: "line-3" }] }),
      parseRefundApplication({ ...application, id: "app-4", status: "rejected", lines: [{ ...application.lines[0], lineId: "line-4" }] }),
    ])

    expect([...activeLineIds]).toEqual(["line-1", "line-2"])
  })
})
