import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { compileScript, parse } from "vue/compiler-sfc"
import { ModuleKind, transpileModule } from "typescript"
import * as vue from "vue"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SubscriptionChoice, UserNotificationTemplate } from "../src/user-notification-api"

type ProfileLoginSheet = {
  readonly phoneAuthorized: vue.Ref<boolean>
  readonly subscriptionVisible: vue.Ref<boolean>
  readonly privacyVisible: vue.Ref<boolean>
  readonly serviceAllowed: vue.Ref<boolean>
  readonly requestPrivacy: () => void
  readonly allowService: () => void
  readonly finishLogin: () => void
  readonly subscribe: (ids: readonly string[]) => Promise<void>
  readonly error: vue.Ref<string>
  readonly authorizePhone: (event: { readonly detail?: { readonly code?: unknown; readonly phoneNumber?: unknown } }) => Promise<void>
  readonly saveProfile: (event?: { readonly detail?: { readonly value?: { readonly nickname?: unknown } } }) => Promise<void>
  readonly chooseAvatar: (event: { readonly detail?: { readonly avatarUrl?: unknown } }) => void
  readonly cancel: () => void
}

const templates: readonly UserNotificationTemplate[] = [{
  id: "enrollment", title: "报名成功提醒", category: "enrollment", templateId: "wx-enrollment", enabled: true, subscription: null,
}]
let token: string | undefined
let unmount: (() => void) | undefined
const emitted = vi.fn()
const loginWithWechatPhone = vi.fn(async () => {
  token = "account-a"
  return { token, familyCode: "family-a", expiresAt: "2026-10-03T00:00:00.000Z", phoneVerified: true }
})
const overview = vi.fn(async (): Promise<readonly UserNotificationTemplate[]> => templates)
const subscribe = vi.fn(async (): Promise<readonly UserNotificationTemplate[]> => templates)
const requestSubscriptions = vi.fn(async (): Promise<readonly SubscriptionChoice[]> => [{ templateId: "wx-enrollment", result: "reject" }])
const localProfile = vi.fn()
const clearCurrentSession = vi.fn((expected: string) => { if (token === expected) token = undefined })
const login = vi.fn((options: { success: (value: { code: string }) => void }) => options.success({ code: "wx-code" }))
const persistAvatar = vi.fn(async (): Promise<string> => "")
const showToast = vi.fn()
const hasServiceConsent = vi.fn(() => true)

function setup(): ProfileLoginSheet {
  const source = readFileSync(new URL("../src/components/ProfileLoginSheet.vue", import.meta.url), "utf8")
  const { descriptor } = parse(source)
  const compiled = compileScript(descriptor, { id: "profile-login-sheet" })
  const code = transpileModule(compiled.content, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
  const exports: { default?: { setup: (props: object, context: object) => ProfileLoginSheet } } = {}
  runInNewContext(code, { exports, Error, uni: { login, getStorageSync: vi.fn(), setStorageSync: vi.fn(), showToast }, require: (name: string) => {
    if (name === "vue") return { ...vue, onUnmounted: (callback: () => void) => { unmount = callback } }
    if (name.endsWith("/api")) return { createMiniappApi: () => ({ loginWithWechatPhone }) }
    if (name.endsWith("user-notification-api")) return { createUserNotificationApi: () => ({ overview, subscribe }), requestUserSubscriptions: requestSubscriptions }
    if (name.endsWith("profile-display")) return { discardPersistedAvatar: vi.fn(), loadLocalProfile: vi.fn(() => null), persistAvatar, saveLocalProfile: localProfile }
    if (name.endsWith("wechat-token")) return { clearWechatSessionTokenIfCurrent: clearCurrentSession, getEnrollmentDraftOwner: () => token === "account-a" || token === "account-a-replaced" ? "family:family-a" : token === "account-b" ? "family:family-b" : "guest", getWechatSessionToken: () => token }
    if (name.endsWith("service-consent")) return { hasServiceConsent }
    if (name.endsWith("ServiceConsent.vue")) return { default: {} }
    return {}
  } })
  if (exports.default === undefined) throw new Error("Missing profile login sheet")
  return exports.default.setup({ requirePhone: true, title: "登录或注册" }, { expose: vi.fn(), emit: emitted })
}

beforeEach(() => {
  vi.clearAllMocks()
  token = undefined
  hasServiceConsent.mockReturnValue(true)
  unmount = undefined
  loginWithWechatPhone.mockImplementation(async () => {
    token = "account-a"
    return { token, familyCode: "family-a", expiresAt: "2026-10-03T00:00:00.000Z", phoneVerified: true }
  })
  overview.mockResolvedValue(templates)
  subscribe.mockResolvedValue(templates)
  requestSubscriptions.mockResolvedValue([{ templateId: "wx-enrollment", result: "reject" }])
  persistAvatar.mockResolvedValue("")
})

describe("profile login sheet", () => {
  it("does not start phone login after unmount while waiting for the WeChat code", async () => {
    let finishCode: (value: { code: string }) => void = () => { throw new Error("WeChat login did not start") }
    login.mockImplementationOnce(options => { finishCode = options.success })
    const sheet = setup()
    const pending = sheet.authorizePhone({ detail: { code: "phone-code" } })
    unmount?.()
    finishCode({ code: "old-wx-code" })
    await pending
    expect(loginWithWechatPhone).not.toHaveBeenCalled()
    expect(token).toBeUndefined()
    expect(emitted).not.toHaveBeenCalled()
  })

  it.each(["account-b", "account-a-replaced"])("keeps %s when identity changes while waiting for the WeChat code", async (newToken) => {
    let finishCode: (value: { code: string }) => void = () => { throw new Error("WeChat login did not start") }
    login.mockImplementationOnce(options => { finishCode = options.success })
    token = "account-a"
    const sheet = setup()
    const pending = sheet.authorizePhone({ detail: { code: "phone-code" } })
    token = newToken
    finishCode({ code: "old-wx-code" })
    await pending
    expect(loginWithWechatPhone).not.toHaveBeenCalled()
    expect(token).toBe(newToken)
    expect(emitted).not.toHaveBeenCalled()
  })

  it("does not complete a phone session until the user saves the profile form", async () => {
    const sheet = setup()

    await sheet.authorizePhone({ detail: { code: "phone-code", phoneNumber: "13800138000" } })

    expect(sheet.phoneAuthorized.value).toBe(true)
    expect(emitted.mock.calls.some(([event]) => event === "completed")).toBe(false)

    sheet.cancel()

    expect(clearCurrentSession).toHaveBeenCalledWith("account-a")
    expect(token).toBeUndefined()
    expect(emitted).toHaveBeenCalledWith("cancelled")
    expect(emitted.mock.calls.some(([event]) => event === "completed")).toBe(false)
  })

  it("clears a phone session returned after the sheet is unmounted", async () => {
    let finishLogin: (value: { readonly token: string; readonly familyCode: string; readonly expiresAt: string; readonly phoneVerified: boolean }) => void = () => { throw new Error("Phone login did not start") }
    loginWithWechatPhone.mockImplementationOnce(() => new Promise((resolve) => { finishLogin = resolve }))
    const sheet = setup()
    const authorizing = sheet.authorizePhone({ detail: { code: "phone-code" } })
    await vi.waitFor(() => expect(loginWithWechatPhone).toHaveBeenCalledOnce())

    unmount?.()
    token = "account-a"
    finishLogin({ token: "account-a", familyCode: "family-a", expiresAt: "2026-10-03T00:00:00.000Z", phoneVerified: true })
    await authorizing

    expect(clearCurrentSession).toHaveBeenCalledWith("account-a")
    expect(token).toBeUndefined()
    expect(emitted.mock.calls.some(([event]) => event === "completed")).toBe(false)
  })

  it("opens a separate subscription choice after saving and completes when skipped", async () => {
    const sheet = setup()
    await sheet.authorizePhone({ detail: { code: "phone-code" } })

    await sheet.saveProfile()

    expect(sheet.subscriptionVisible.value).toBe(true)
    expect(emitted).not.toHaveBeenCalled()
    sheet.finishLogin()

    expect(requestSubscriptions).not.toHaveBeenCalled()
    expect(subscribe).not.toHaveBeenCalled()
    expect(emitted).toHaveBeenCalledWith("completed", expect.objectContaining({ familyCode: "family-a" }), undefined)
    expect(token).toBe("account-a")
  })

  it("requests subscriptions only from the separate receive tap and continues after rejection", async () => {
    const sheet = setup()
    await sheet.authorizePhone({ detail: { code: "phone-code", phoneNumber: "13800138000" } })
    login.mockClear()

    const saving = sheet.saveProfile({ detail: { value: { nickname: "小林" } } })

    expect(requestSubscriptions).not.toHaveBeenCalled()
    await saving
    const subscribing = sheet.subscribe(["wx-enrollment"])
    expect(requestSubscriptions).toHaveBeenCalledWith(templates)
    await subscribing

    expect(localProfile).toHaveBeenCalledWith("family:family-a", { nickname: "小林", avatarPath: "" })
    expect(subscribe).toHaveBeenCalledWith("wx-code", [{ templateId: "wx-enrollment", result: "reject" }])
    expect(emitted).toHaveBeenCalledWith("completed", expect.objectContaining({ familyCode: "family-a" }), "13800138000")
    unmount?.()
    expect(token).toBe("account-a")
    expect(clearCurrentSession).not.toHaveBeenCalled()
  })

  it("finishes avatar saving before offering subscriptions and continues after native failure", async () => {
    let finishAvatar: (path: string) => void = () => { throw new Error("Avatar did not start") }
    persistAvatar.mockImplementationOnce(() => new Promise((resolve) => { finishAvatar = resolve }))
    requestSubscriptions.mockRejectedValueOnce(new Error("native reject"))
    const sheet = setup()
    await sheet.authorizePhone({ detail: { code: "phone-code" } })
    sheet.chooseAvatar({ detail: { avatarUrl: "wxfile://temporary-avatar" } })

    const saving = sheet.saveProfile({ detail: { value: { nickname: "小林" } } })
    expect(requestSubscriptions).not.toHaveBeenCalled()
    finishAvatar("wxfile://saved-avatar")
    await saving
    await sheet.subscribe(["wx-enrollment"])

    expect(subscribe).not.toHaveBeenCalled()
    expect(localProfile).toHaveBeenCalledWith("family:family-a", { nickname: "小林", avatarPath: "wxfile://saved-avatar" })
    expect(showToast).toHaveBeenCalledWith({ title: "登录成功，消息提醒可在设置中重试", icon: "none" })
    expect(emitted.mock.calls.some(([event]) => event === "completed")).toBe(true)
  })

  it("does not complete after the account changes while saving subscription choices", async () => {
    let resolveSubscription: (rows: readonly UserNotificationTemplate[]) => void = () => { throw new Error("Subscription did not start") }
    subscribe.mockImplementationOnce(() => new Promise((resolve) => { resolveSubscription = resolve }))
    const sheet = setup()
    await sheet.authorizePhone({ detail: { code: "phone-code" } })
    await sheet.saveProfile()
    const saving = sheet.subscribe(["wx-enrollment"])
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledOnce())

    token = "account-b"
    resolveSubscription(templates)
    await saving

    expect(emitted.mock.calls.some(([event]) => event === "completed")).toBe(false)
  })

  it("does not complete after the same family receives a newer session token", async () => {
    let resolveSubscription: (rows: readonly UserNotificationTemplate[]) => void = () => { throw new Error("Subscription did not start") }
    subscribe.mockImplementationOnce(() => new Promise((resolve) => { resolveSubscription = resolve }))
    const sheet = setup()
    await sheet.authorizePhone({ detail: { code: "phone-code" } })
    await sheet.saveProfile()
    const saving = sheet.subscribe(["wx-enrollment"])
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledOnce())

    token = "account-a-replaced"
    resolveSubscription(templates)
    await saving

    expect(emitted.mock.calls.some(([event]) => event === "completed")).toBe(false)
  })

  it("shows the independent privacy policy when login is opened without current consent", async () => {
    hasServiceConsent.mockReturnValue(false)
    const sheet = setup()
    expect(sheet.serviceAllowed.value).toBe(false)
    expect(sheet.privacyVisible.value).toBe(true)
    await sheet.authorizePhone({ detail: { code: "phone-code" } })
    expect(loginWithWechatPhone).not.toHaveBeenCalled()
    sheet.requestPrivacy()
    expect(sheet.privacyVisible.value).toBe(true)
    sheet.allowService()
    expect(sheet.privacyVisible.value).toBe(false)
    await sheet.authorizePhone({ detail: { code: "phone-code" } })
    expect(loginWithWechatPhone).toHaveBeenCalledOnce()
  })

  it("still asks before completing when no notifications are available", async () => {
    overview.mockResolvedValueOnce([])
    const sheet = setup()
    await sheet.authorizePhone({ detail: { code: "phone-code" } })
    await sheet.saveProfile()
    expect(sheet.subscriptionVisible.value).toBe(true)
    expect(emitted).not.toHaveBeenCalled()
    expect(requestSubscriptions).not.toHaveBeenCalled()
    sheet.finishLogin()
    expect(emitted).toHaveBeenCalledWith("completed", expect.anything(), undefined)
  })

  it("offers notifications already active on the account after saving", async () => {
    overview.mockResolvedValueOnce(templates.map(item => ({ ...item, subscription: { id: "subscription-existing", status: "active", version: 1 } })))
    const sheet = setup()
    await sheet.authorizePhone({ detail: { code: "phone-code" } })
    await sheet.saveProfile()
    expect(sheet.subscriptionVisible.value).toBe(true)
    expect(emitted).not.toHaveBeenCalled()
    await sheet.subscribe(["wx-enrollment"])
    expect(requestSubscriptions).toHaveBeenCalledOnce()
  })

  it("shows the independent prompt after a notification loading failure and allows skipping", async () => {
    overview.mockRejectedValueOnce(new Error("network unavailable"))
    const sheet = setup()
    await sheet.authorizePhone({ detail: { code: "phone-code" } })
    await sheet.saveProfile()
    expect(sheet.subscriptionVisible.value).toBe(true)
    expect(emitted).not.toHaveBeenCalled()
    sheet.finishLogin()
    expect(emitted).toHaveBeenCalledWith("completed", expect.anything(), undefined)
  })
})
