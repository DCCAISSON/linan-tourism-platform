import { describe, expect, it } from "vitest"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { assertUserNotificationAccess, parseUserSubscription, parseUserTask, parseUserTemplate, userTemplateData } from "./user-notifications.parser.js"

const access: StaffAccess = { kind: "administrator", actorId: "staff", forcePasswordChange: false,
  permissionKeys: new Set(["notifications.read", "notifications.write", "notifications.send"]), scopes: [{ kind: "all", id: null }] }
const fields = [{ key: "thing1", label: "活动名称", rule: "thing" }, { key: "time2", label: "活动时间", rule: "time" }] as const

describe("user notification boundaries", () => {
  it.each(["notifications.read", "notifications.write", "notifications.send"] as const)("requires all scope for %s even when permission exists", permission => {
    const scoped = { ...access, scopes: [{ kind: "school", id: "school" }] } satisfies StaffAccess
    expect(() => assertUserNotificationAccess(scoped, permission)).toThrow()
  })
  it("rejects global users without the requested permission", () => {
    expect(() => assertUserNotificationAccess({ ...access, permissionKeys: new Set() }, "notifications.send")).toThrow()
  })
  it.each(["openid", "subscriberOpenid", "receiverName", "orderId", "actorId"])("rejects client supplied %s", field => {
    const input = { code: "code", outcomes: [{ templateId: "wx-template", result: "accept" }], [field]: "untrusted" }
    expect(() => parseUserSubscription(input)).toThrow()
  })
  it("preserves each actual popup outcome independently", () => {
    const input = { code: "fresh", outcomes: [{ templateId: "one", result: "accept" }, { templateId: "two", result: "reject" }] }
    expect(parseUserSubscription(input)).toEqual(input)
  })
  it("rejects duplicate outcome template IDs", () => {
    expect(() => parseUserSubscription({ code: "fresh", outcomes: [{ templateId: "one", result: "accept" }, { templateId: "one", result: "reject" }] })).toThrow()
  })
  it("allows only once templates with keys matching field rules", () => {
    const input = { title: "活动", category: "活动开始提醒", templateId: "wx-template", type: "once", fields: [...fields], enabled: true }
    expect(parseUserTemplate(input)).toEqual(input)
    expect(() => parseUserTemplate({ ...input, fields: [{ key: "thing1", label: "时间", rule: "time" }] })).toThrow()
  })
  it("requires the exact configured payload fields", () => {
    expect(userTemplateData(fields, { thing1: "山野活动", time2: "2026-10-01 09:00" })).toEqual({ thing1: { value: "山野活动" }, time2: { value: "2026-10-01 09:00" } })
    expect(() => userTemplateData(fields, { thing1: "山野活动" })).toThrow()
    expect(() => userTemplateData(fields, { thing1: "山野活动", time2: "2026-10-01", extra: "extra" })).toThrow()
  })
  it("rejects impossible dates before task creation", () => {
    expect(() => userTemplateData(fields, { thing1: "活动", time2: "2026-02-30 25:00" })).toThrow()
  })
  it("rejects oversized thing and malformed number values", () => {
    expect(() => userTemplateData([fields[0]], { thing1: "游".repeat(21) })).toThrow()
    expect(() => userTemplateData([{ key: "number2", label: "数量", rule: "number" }], { number2: "二" })).toThrow()
  })
  it("canonicalizes recipient and payload order for idempotency", () => {
    const input = { templateId: "template", subscriberIds: ["b", "a"], idempotencyKey: "key", payload: { thing3: "备注", thing1: "名称" } }
    expect(parseUserTask(input)).toEqual({ ...input, subscriberIds: ["a", "b"], page: null })
    expect(() => parseUserTask({ ...input, page: "https://example.com" })).toThrow()
    expect(() => parseUserTask({ ...input, subscriberIds: ["a", "a"] })).toThrow()
  })
})
