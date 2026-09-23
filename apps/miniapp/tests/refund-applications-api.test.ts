import { describe, expect, it } from "vitest"
import { ApiError } from "../src/api"
import { createRefundApplicationClient, parseRefundApplication } from "../src/refund-applications-api"
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
      header: { "Content-Type": "application/json", "x-linan-dev-family-identity": "family-a" },
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
    expect(() => parseRefundApplication({ ...application, status: "succeeded" })).toThrow(new ApiError(0, "status 响应格式不正确"))
  })
})
