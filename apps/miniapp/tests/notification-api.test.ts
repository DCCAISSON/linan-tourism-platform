import { describe, expect, it } from "vitest"
import { ApiError } from "../src/api-error"
import { createNotificationApi } from "../src/notification-api"
import type { MiniappRequestOptions } from "../src/api-types"

const overview = {
  orderId: "order-1",
  authorizations: [{ id: "authorization-1", orderId: "order-1", receiverName: "林女士", relation: "guardian", channel: "wechat_subscribe", active: true, version: 1, revokedAt: null, createdAt: "2026-09-23T00:00:00.000Z" }],
  entries: [{ kind: "customer_service", label: "联系客服", url: "https://service.example.test", enabled: true, version: 1 }],
} as const

describe("miniapp notification API", () => {
  it("loads only the scoped order overview with the family identity", async () => {
    const requests: MiniappRequestOptions[] = []
    const api = createNotificationApi({ baseUrl: "https://api.example.test", familyIdentityHeader: "family-1", request: async (options) => { requests.push(options); return { statusCode: 200, data: overview } } })

    const result = await api.getOverview("order/1")

    expect(result.authorizations[0]?.receiverName).toBe("林女士")
    expect(requests[0]).toMatchObject({ url: "https://api.example.test/orders/order%2F1/notifications", method: "GET", header: { "x-linan-dev-family-identity": "family-1" } })
  })

  it("authorizes a named receiver and never sends a payer field", async () => {
    const requests: MiniappRequestOptions[] = []
    const api = createNotificationApi({ baseUrl: "https://api.example.test", request: async (options) => { requests.push(options); return { statusCode: 201, data: overview.authorizations[0] } } })

    await api.authorize("order-1", { receiverName: "林女士", relation: "guardian", channel: "wechat_subscribe", idempotencyKey: "recipient-key-1" })

    expect(requests[0]?.data).toEqual({ receiverName: "林女士", relation: "guardian", channel: "wechat_subscribe", idempotencyKey: "recipient-key-1" })
    expect(requests[0]?.data).not.toHaveProperty("payerName")
  })

  it("withdraws with the displayed authorization version", async () => {
    const requests: MiniappRequestOptions[] = []
    const api = createNotificationApi({ baseUrl: "https://api.example.test", request: async (options) => { requests.push(options); return { statusCode: 200, data: { ...overview.authorizations[0], active: false, version: 2, revokedAt: "2026-09-23T01:00:00.000Z" } } } })

    const result = await api.withdraw("order-1", "authorization/1", 1)

    expect(requests[0]).toMatchObject({ url: "https://api.example.test/orders/order-1/notification-recipients/authorization%2F1/withdraw", method: "POST", data: { expectedVersion: 1 } })
    expect(result.active).toBe(false)
  })

  it("rejects non-HTTPS enabled entries", async () => {
    const api = createNotificationApi({ request: async () => ({ statusCode: 200, data: { ...overview, entries: [{ ...overview.entries[0], url: "http://unsafe.example.test" }] } }) })

    await expect(api.getOverview("order-1")).rejects.toEqual(new ApiError(0, "notification entry.url response format is invalid"))
  })
})
