import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { compileScript, parse } from "vue/compiler-sfc"
import { ModuleKind, transpileModule } from "typescript"
import * as vue from "vue"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SubscriptionChoice, UserNotificationTemplate } from "../src/user-notification-api"

type Consent = {
  readonly accepted: vue.Ref<boolean>
  readonly busy: vue.Ref<boolean>
  readonly error: vue.Ref<string>
  readonly subscriptionTemplates: vue.Ref<readonly UserNotificationTemplate[]>
  readonly loginWithWechatPhone: (event: { readonly detail?: { readonly code?: unknown } }) => Promise<void>
  readonly subscribe: () => Promise<void>
  readonly skipSubscription: () => void
}
const enrollment: UserNotificationTemplate = { id: "enrollment", title: "报名成功提醒", category: "enrollment", templateId: "wx-enrollment", enabled: true, subscription: null }
const activity: UserNotificationTemplate = { id: "activity", title: "新活动提醒", category: "activity", templateId: "wx-activity", enabled: true, subscription: null }
const rows: readonly UserNotificationTemplate[] = [enrollment, activity]
let token: string | undefined
const emit = vi.fn()
const phoneLoginApi = vi.fn(async () => {
  token = "phone-account-a"
  return { token, familyCode: "family-a", expiresAt: "2026-10-03T00:00:00.000Z" }
})
const overview = vi.fn(async (): Promise<readonly UserNotificationTemplate[]> => rows)
const save = vi.fn(async (): Promise<readonly UserNotificationTemplate[]> => rows)
const requestSubscriptions = vi.fn(async (): Promise<readonly SubscriptionChoice[]> => [{ templateId: "wx-enrollment", result: "accept" }])
const wechatLogin = vi.fn((options: { success: (result: { code: string }) => void }) => options.success({ code: "wx-code" }))
const toast = vi.fn()
function setup(promptSubscriptions = true): Consent {
  const source = readFileSync(new URL("../src/components/WechatConsent.vue", import.meta.url), "utf8")
  const { descriptor } = parse(source)
  const compiled = compileScript(descriptor, { id: "consent" })
  const code = transpileModule(compiled.content, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
  const exports: { default?: { setup: (props: object, context: object) => Consent } } = {}
  runInNewContext(code, { exports, Error, uni: { login: wechatLogin, showToast: toast }, require: (name: string) => {
    if (name === "vue") return vue
    if (name.endsWith("/api")) return { createMiniappApi: () => ({ loginWithWechatPhone: phoneLoginApi }) }
    if (name.endsWith("user-notification-api")) return { createUserNotificationApi: () => ({ overview, subscribe: save }), requestUserSubscriptions: requestSubscriptions }
    if (name.endsWith("wechat-token")) return { getWechatSessionToken: () => token }
    if (name.endsWith("page-helpers")) return { readableError: (cause: unknown, fallback: string) => cause instanceof Error ? cause.message : fallback }
    return {}
  } })
  if (!exports.default) throw new Error("Missing component")
  const consent = exports.default.setup({ promptSubscriptions }, { expose: vi.fn(), emit: (event: string) => { if (event === "authenticated") emit(event) } })
  consent.accepted.value = true
  return consent
}
beforeEach(() => {
  vi.clearAllMocks()
  token = undefined
  phoneLoginApi.mockImplementation(async () => {
    token = "phone-account-a"
    return { token, familyCode: "family-a", expiresAt: "2026-10-03T00:00:00.000Z" }
  })
  overview.mockResolvedValue(rows)
  save.mockResolvedValue(rows)
  requestSubscriptions.mockResolvedValue([{ templateId: "wx-enrollment", result: "accept" }])
  wechatLogin.mockImplementation((options) => options.success({ code: "wx-code" }))
})
async function authorizePhone(consent: Consent): Promise<void> {
  await consent.loginWithWechatPhone({ detail: { code: "phone-code" } })
}
describe("post-login subscription choice", () => {
  it("keeps phone authorization as the only visible login route", () => {
    const source = readFileSync(new URL("../src/components/WechatConsent.vue", import.meta.url), "utf8")

    expect(source).toContain('open-type="getPhoneNumber"')
    expect(source).not.toContain("微信身份登录")
    expect(source).not.toContain("手机号验证码登录")
    expect(source).not.toContain("sendSmsLoginCode")
    expect(source).not.toContain("loginWithSmsCode")
  })
  it("offers eligible notifications after login without requesting permission automatically", async () => {
    const consent = setup()
    await authorizePhone(consent)
    expect(consent.subscriptionTemplates.value).toEqual(rows)
    expect(emit).not.toHaveBeenCalled()
    expect(requestSubscriptions).not.toHaveBeenCalled()
  })
  it("waits for an explicit post-phone-login tap before requesting notification permission", async () => {
    const consent = setup()

    await authorizePhone(consent)

    expect(consent.subscriptionTemplates.value).toEqual(rows)
    expect(requestSubscriptions).not.toHaveBeenCalled()
    expect(emit).not.toHaveBeenCalled()

    await consent.subscribe()

    expect(requestSubscriptions).toHaveBeenCalledWith(rows)
    expect(save).toHaveBeenCalledWith("wx-code", [{ templateId: "wx-enrollment", result: "accept" }])
    expect(emit).toHaveBeenCalledWith("authenticated")
  })
  it("continues once without writing subscriptions when skipped", async () => {
    const consent = setup()
    await authorizePhone(consent)
    consent.skipSubscription()
    consent.skipSubscription()
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith("authenticated")
    expect(token).toBe("phone-account-a")
    expect(save).not.toHaveBeenCalled()
  })
  it("invokes native consent in the tap before fetching a fresh code, then saves", async () => {
    const consent = setup()
    await authorizePhone(consent)
    wechatLogin.mockClear()
    const pending = consent.subscribe()
    expect(requestSubscriptions).toHaveBeenCalledWith(rows)
    expect(wechatLogin).not.toHaveBeenCalled()
    await pending
    expect(save).toHaveBeenCalledWith("wx-code", [{ templateId: "wx-enrollment", result: "accept" }])
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith("authenticated")
  })
  it("preserves rejection and still continues the original flow", async () => {
    requestSubscriptions.mockResolvedValue([{ templateId: "wx-enrollment", result: "reject" }])
    const consent = setup()
    await authorizePhone(consent)
    await consent.subscribe()
    expect(save).toHaveBeenCalledWith("wx-code", [{ templateId: "wx-enrollment", result: "reject" }])
    expect(emit).toHaveBeenCalledWith("authenticated")
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining("已订阅") }))
  })
  it("offers at most one enrollment and one activity template, excluding unrelated enabled types", async () => {
    overview.mockResolvedValue([
      { ...activity, id: "activity-second", templateId: "wx-activity-second" },
      { ...enrollment, id: "enrollment-first", templateId: "wx-enrollment-first" },
      { ...activity, id: "activity-first", templateId: "wx-activity-first" },
      { ...enrollment, id: "enrollment-active", templateId: "wx-enrollment-active", subscription: { id: "active", status: "active", version: 1 } },
      { ...activity, id: "orders", category: "orders", templateId: "wx-orders" },
    ])
    const consent = setup()
    await authorizePhone(consent)
    expect(consent.subscriptionTemplates.value.map((row) => row.id)).toEqual(["enrollment-first", "activity-second"])
  })
  it.each(["empty", "failure", "bypass"])("keeps successful login usable for %s overview", async (state) => {
    if (state === "empty") overview.mockResolvedValue([])
    if (state === "failure") overview.mockRejectedValueOnce(new Error("offline"))
    const consent = setup(state !== "bypass")
    await authorizePhone(consent)
    expect(emit).toHaveBeenCalledWith("authenticated")
    expect(requestSubscriptions).not.toHaveBeenCalled()
    if (state === "bypass") expect(overview).not.toHaveBeenCalled()
  })
  it("retries failed save without asking for WeChat permission twice", async () => {
    save.mockRejectedValueOnce(new Error("offline"))
    const consent = setup()
    await authorizePhone(consent)
    await consent.subscribe()
    expect(consent.error.value).toContain("offline")
    expect(emit).not.toHaveBeenCalled()
    await consent.subscribe()
    expect(requestSubscriptions).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledTimes(2)
    expect(emit).toHaveBeenCalledWith("authenticated")
  })
  it("allows skip after native cancellation", async () => {
    requestSubscriptions.mockRejectedValueOnce(new Error("cancel"))
    const consent = setup()
    await authorizePhone(consent)
    await consent.subscribe()
    expect(save).not.toHaveBeenCalled()
    consent.skipSubscription()
    expect(emit).toHaveBeenCalledWith("authenticated")
  })
  it("discards choices if the account changes before subscription save", async () => {
    const consent = setup()
    await authorizePhone(consent)
    wechatLogin.mockImplementationOnce((options) => { token = "account-b"; options.success({ code: "wx-code" }) })
    await consent.subscribe()
    expect(save).not.toHaveBeenCalled()
    expect(emit).not.toHaveBeenCalled()
    expect(consent.subscriptionTemplates.value).toEqual([])
  })
  it("does not continue as authenticated after overview invalidates the token", async () => {
    overview.mockImplementationOnce(async () => { token = undefined; throw new Error("expired") })
    const consent = setup()
    await authorizePhone(consent)
    expect(emit).not.toHaveBeenCalled()
    expect(consent.error.value).toContain("登录")
  })
})
