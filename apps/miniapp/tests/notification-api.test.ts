import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "../src/api-error"
import { createNotificationApi, requestNotificationSubscription } from "../src/notification-api"
import type { MiniappRequestOptions } from "../src/api-types"

const overview = {
  orderId: "order-1",
  authorizations: [{ id: "authorization-1", orderId: "order-1", receiverName: "林女士", relation: "guardian", channel: "wechat_subscribe", active: true, version: 1, revokedAt: null, createdAt: "2026-09-23T00:00:00.000Z" }],
  entries: [{ kind: "customer_service", label: "联系客服", url: "https://service.example.test", enabled: true, version: 1 }],
} as const

describe("miniapp notification API", () => {
  afterEach(() => vi.unstubAllGlobals())
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

    await expect(api.getOverview("order-1")).rejects.toEqual(new ApiError(0, "消息提醒暂时无法加载，请稍后再试。"))
  })

  it("loads configured templates from the scoped overview and rejects malformed IDs", async () => {
    const api = createNotificationApi({ request: async () => ({ statusCode: 200, data: { ...overview, subscribeTemplates: [{ templateId: "template-1", title: "集合提醒" }] } }) })
    expect((await api.getOverview("order-1")).subscribeTemplates).toEqual([{ templateId: "template-1", title: "集合提醒" }])
    const invalid = createNotificationApi({ request: async () => ({ statusCode: 200, data: { ...overview, subscribeTemplates: [{ templateId: "bad id", title: "集合提醒" }] } }) })
    await expect(invalid.getOverview("order-1")).rejects.toThrow()
  })

  it.each(["accept", "reject", "ban", "filter"] as const)("reports the platform result %s for only the clicked template", async (outcome) => {
    const requestSubscribeMessage = vi.fn((options: { tmplIds: string[]; success: (value: unknown) => void }) => options.success({ "template-1": outcome }))
    vi.stubGlobal("uni", { requestSubscribeMessage })
    const result = requestNotificationSubscription("template-1", [{ templateId: "template-1", title: "集合提醒" }, { templateId: "template-2", title: "行前提醒" }])
    expect(requestSubscribeMessage).toHaveBeenCalledWith(expect.objectContaining({ tmplIds: ["template-1"] }))
    await expect(result).resolves.toBe(outcome)
  })

  it("does not open platform consent for an unconfigured or forged template", async () => {
    const requestSubscribeMessage = vi.fn()
    vi.stubGlobal("uni", { requestSubscribeMessage })
    await expect(requestNotificationSubscription("forged", [])).rejects.toThrow("该消息提醒暂未开放")
    expect(requestSubscribeMessage).not.toHaveBeenCalled()
  })

  it("does not report acceptance when the platform fails or omits the selected result", async () => {
    vi.stubGlobal("uni", { requestSubscribeMessage: (options: { fail: () => void }) => options.fail() })
    await expect(requestNotificationSubscription("template-1", [{ templateId: "template-1", title: "提醒" }])).rejects.toThrow("未完成微信订阅")
    vi.stubGlobal("uni", { requestSubscribeMessage: (options: { success: (value: unknown) => void }) => options.success({ "other-template": "accept" }) })
    await expect(requestNotificationSubscription("template-1", [{ templateId: "template-1", title: "提醒" }])).rejects.toThrow("未完成微信订阅")
  })
})
