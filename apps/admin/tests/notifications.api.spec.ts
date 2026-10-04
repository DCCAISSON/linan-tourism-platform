// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { createNotificationTask, previewNotificationTargets, retryNotificationTask, saveNotificationEntry } from "@/api/notifications"

const target = { id: "target-1", authorizationId: "authorization-1", orderId: "order-1", receiverName: "林女士", relation: "guardian", channel: "wechat_subscribe", status: "pending" } as const
const task = { id: "task-1", tourSessionId: "session-1", contentVersionId: "content-1", status: "pending", createdAt: "2026-09-23T00:00:00.000Z", targets: [target], attempts: [] } as const

describe("notification admin API", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("previews only the explicit authorization ids", async () => {
    const request = vi.fn(async () => Response.json([{ authorizationId: "authorization-1", orderId: "order-1", receiverName: "林女士", relation: "guardian", channel: "wechat_subscribe" }]))
    vi.stubGlobal("fetch", request)

    const result = await previewNotificationTargets("session/1", ["authorization-1"])

    expect(request).toHaveBeenCalledWith("http://127.0.0.1:3000/staff/notifications/sessions/session%2F1/preview", expect.objectContaining({ body: JSON.stringify({ authorizationIds: ["authorization-1"] }), credentials: "include" }))
    expect(result[0]?.receiverName).toBe("林女士")
  })

  it("creates an idempotent task from the previewed ids", async () => {
    const request = vi.fn(async () => Response.json(task))
    vi.stubGlobal("fetch", request)

    await createNotificationTask("session-1", { contentVersionId: "content-1", authorizationIds: ["authorization-1"], idempotencyKey: "task-key-1" })

    expect(request).toHaveBeenCalledWith(expect.stringContaining("/tasks"), expect.objectContaining({ body: JSON.stringify({ contentVersionId: "content-1", authorizationIds: ["authorization-1"], idempotencyKey: "task-key-1" }) }))
  })

  it("uses explicit retry and optimistic entry versions", async () => {
    const request = vi.fn(async (input: string | URL | Request) => Response.json(String(input).endsWith("/retry") ? task : { kind: "customer_service", label: "联系客服", url: "https://service.example.test", enabled: true, version: 3 }))
    vi.stubGlobal("fetch", request)

    await saveNotificationEntry("session-1", "customer_service", { label: "联系客服", url: "https://service.example.test", enabled: true, expectedVersion: 2 })
    await retryNotificationTask("task/1")

    expect(request).toHaveBeenNthCalledWith(1, expect.stringContaining("/entries/customer_service"), expect.objectContaining({ method: "PUT", body: expect.stringContaining('"expectedVersion":2') }))
    expect(request).toHaveBeenNthCalledWith(2, expect.stringContaining("/tasks/task%2F1/retry"), expect.objectContaining({ method: "POST" }))
  })
})
