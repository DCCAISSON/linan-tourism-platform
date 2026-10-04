import { beforeEach, describe, expect, it, vi } from "vitest"
import { createUserNotificationApi, requestUserSubscriptions } from "../src/user-notification-api"

const first = { id: "new-activity", title: "新活动通知", category: "新活动", templateId: "wx-new", enabled: true, subscription: null }
const second = { ...first, id: "reminder", templateId: "wx-reminder" }
const storage = new Map<string, unknown>()
const native = vi.fn()
beforeEach(() => {
  storage.clear(); native.mockReset()
  vi.stubGlobal("uni", { getStorageSync: (key: string) => storage.get(key), removeStorageSync: (key: string) => storage.delete(key), requestSubscribeMessage: native })
})

describe("user notification API boundaries", () => {
  it("requests both templates together and preserves partial consent", async () => {
    native.mockImplementation((options) => options.success({ "wx-new": "accept", "wx-reminder": "reject" }))
    await expect(requestUserSubscriptions([first, second])).resolves.toEqual([
      { templateId: "wx-new", result: "accept" }, { templateId: "wx-reminder", result: "reject" },
    ])
    expect(native).toHaveBeenCalledWith(expect.objectContaining({ tmplIds: ["wx-new", "wx-reminder"] }))
  })
  it.each([null, {}, { "wx-new": "unexpected" }])("rejects incomplete native result %j", async (result) => {
    native.mockImplementation((options) => options.success(result))
    await expect(requestUserSubscriptions([first])).rejects.toThrow("微信未返回完整订阅结果")
  })
  it("does not call the API without login", async () => {
    const transport = vi.fn()
    await expect(createUserNotificationApi({ request: transport }).overview()).rejects.toThrow("请先登录")
    expect(transport).not.toHaveBeenCalled()
  })
  it("clears only the expired identity on unauthorized response", async () => {
    storage.set("linan_wechat_session_token", "expired")
    const api = createUserNotificationApi({ request: async () => ({ statusCode: 401, data: {} }) })
    await expect(api.overview()).rejects.toThrow()
    expect(storage.has("linan_wechat_session_token")).toBe(false)
  })
  it("retains a new identity when an older request fails authentication", async () => {
    storage.set("linan_wechat_session_token", "expired")
    const api = createUserNotificationApi({ request: async () => {
      storage.set("linan_wechat_session_token", "new-account")
      return { statusCode: 401, data: {} }
    } })
    await expect(api.overview()).rejects.toThrow()
    expect(storage.get("linan_wechat_session_token")).toBe("new-account")
  })
  it("sends current identity with no order or recipient form", async () => {
    storage.set("linan_wechat_session_token", "fixture-session")
    const transport = vi.fn(async () => ({ statusCode: 200, data: { templates: [{ ...first, type: "once" }] } }))
    const api = createUserNotificationApi({ baseUrl: "https://fixture.invalid/", request: transport })
    await expect(api.subscribe("fixture-code", [{ templateId: "wx-new", result: "accept" }])).resolves.toEqual([first])
    expect(transport).toHaveBeenCalledWith({ url: "https://fixture.invalid/user-notifications/subscriptions", method: "POST",
      header: { Authorization: "Bearer fixture-session", "Content-Type": "application/json" },
      data: { code: "fixture-code", outcomes: [{ templateId: "wx-new", result: "accept" }] } })
  })
  it("rejects unsupported subscription response instead of displaying success", async () => {
    storage.set("linan_wechat_session_token", "fixture-session")
    const api = createUserNotificationApi({ request: async () => ({ statusCode: 200, data: { templates: [{ ...first, type: "permanent" }] } }) })
    await expect(api.overview()).rejects.toThrow("消息提醒暂时无法加载，请稍后再试。")
  })
})
