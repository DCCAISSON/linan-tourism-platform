import { describe, expect, it } from "vitest"
import { ApiError } from "@/api/configuration.errors"
import { parseNotificationSession, parseNotificationTask } from "@/api/notifications.parsers"

const target = {
  id: "target-1",
  authorizationId: "authorization-1",
  orderId: "order-1",
  receiverName: "林女士",
  relation: "guardian",
  channel: "wechat_subscribe",
  status: "api_accepted",
} as const

describe("notification admin response boundary", () => {
  it("keeps content versions, HTTPS entries, and task summaries", () => {
    const parsed = parseNotificationSession({
      contents: [{ id: "content-1", title: "集合提醒", bodyText: "请准时到达", templateId: "template-1", miniappPage: null, createdAt: "2026-09-23T00:00:00.000Z" }],
      entries: [{ kind: "customer_service", label: "联系客服", url: "https://service.example.test", enabled: true, version: 2 }],
      tasks: [{ id: "task-1", contentVersionId: "content-1", status: "pending", createdAt: "2026-09-23T00:00:00.000Z" }],
    })

    expect(parsed.contents[0]?.title).toBe("集合提醒")
    expect(parsed.entries[0]?.url).toBe("https://service.example.test")
    expect(parsed.tasks[0]?.status).toBe("pending")
  })

  it("preserves accepted-only evidence without inventing delivery or read", () => {
    const parsed = parseNotificationTask({
      id: "task-1",
      tourSessionId: "session-1",
      contentVersionId: "content-1",
      status: "completed",
      createdAt: "2026-09-23T00:00:00.000Z",
      targets: [target],
      attempts: [{ id: "attempt-1", targetId: "target-1", attemptNumber: 1, status: "api_accepted", errorCode: null, providerMessage: "ok", acceptedAt: "2026-09-23T00:01:00.000Z", deliveryEvidence: "api_accepted_only", readStatus: "unknown", createdAt: "2026-09-23T00:01:00.000Z" }],
    })

    expect(parsed.attempts[0]).toMatchObject({ deliveryEvidence: "api_accepted_only", readStatus: "unknown" })
  })

  it("rejects unknown provider states before the UI renders them", () => {
    expect(() => parseNotificationTask({
      id: "task-1", tourSessionId: "session-1", contentVersionId: "content-1", status: "completed", createdAt: "2026-09-23T00:00:00.000Z",
      targets: [{ ...target, status: "delivered" }], attempts: [],
    })).toThrow(ApiError)
  })
})
