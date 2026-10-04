import { describe, expect, it } from "vitest"
import { parseUserMessageDetail, parseUserMessagePreview, parseUserMessageTemplates } from "@/api/user-notifications.parsers"

describe("user message response parsing", () => {
  it("rejects a malformed template field instead of hiding it", () => {
    const response = { templates: [{ id: "t", title: "新活动", category: "activity", templateId: "wx", type: "once", enabled: true, fields: [{ key: "thing1", label: "活动名称", rule: "unsupported" }] }] }
    expect(() => parseUserMessageTemplates(response)).toThrow("响应格式不正确")
  })
  it("keeps only anonymous subscription identifiers", () => {
    const response = { subscribers: [{ id: "sub-1", version: 1, openid: "private" }], eligibleCount: 1 }
    expect(parseUserMessagePreview(response)).toEqual({ subscribers: [{ id: "sub-1", version: 1 }], eligibleCount: 1 })
  })
  it("rejects invalid counts instead of treating failure as empty", () => {
    expect(() => parseUserMessagePreview({ subscribers: [], eligibleCount: -1 })).toThrow("响应格式不正确")
  })
  it("preserves an unknown attempt outcome without claiming delivery", () => {
    const response = { task: { id: "task", templateId: "t", createdAt: "2026-09-30", status: "manual_required", payloadSnapshot: { title: "新活动", templateId: "wx", page: null, data: { thing1: { value: "秋游" } } } }, targets: [{ id: "target", subscriptionId: "sub", status: "unknown" }], attempts: [{ id: "attempt", targetId: "target", status: "unknown", errorCode: null }] }
    expect(parseUserMessageDetail(response).attempts[0]?.status).toBe("unknown")
  })
})
