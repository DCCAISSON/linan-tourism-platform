import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { compileScript, parse } from "vue/compiler-sfc"
import { ModuleKind, transpileModule } from "typescript"
import * as vue from "vue"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SubscriptionChoice, UserNotificationTemplate } from "../src/user-notification-api"
import { ApiError } from "../src/api-error"

type Page = {
  readonly authenticated: vue.Ref<boolean>
  readonly state: vue.Ref<string>
  readonly templates: vue.Ref<readonly UserNotificationTemplate[]>
  readonly pendingChoices: vue.Ref<readonly SubscriptionChoice[]>
  readonly selectedIds: vue.Ref<readonly string[]>
  readonly selected: vue.ComputedRef<readonly UserNotificationTemplate[]>
  readonly toggle: (id: string) => void
  readonly error: vue.Ref<string>
  readonly message: vue.Ref<string>
  readonly load: () => Promise<void>
  readonly subscribe: () => Promise<void>
  readonly withdraw: (item: UserNotificationTemplate) => Promise<void>
  readonly login: () => void
}
const rows: readonly UserNotificationTemplate[] = ["活动上新", "行前提醒", "服务提醒"].map((title, index) => ({
  id: `type-${index}`, title, category: "activity", templateId: `wx-${index}`, enabled: true, subscription: null,
}))
const mixed: readonly SubscriptionChoice[] = [
  { templateId: "wx-0", result: "accept" }, { templateId: "wx-1", result: "reject" }, { templateId: "wx-2", result: "ban" },
]
let token: string | undefined
const api = {
  overview: vi.fn(async (): Promise<readonly UserNotificationTemplate[]> => rows),
  subscribe: vi.fn(async (_code: string, _choices: readonly SubscriptionChoice[]): Promise<readonly UserNotificationTemplate[]> => rows),
  withdraw: vi.fn(async (_id: string, _version: number): Promise<readonly UserNotificationTemplate[]> => rows),
}
const requestSubscriptions = vi.fn(async (): Promise<readonly SubscriptionChoice[]> => mixed)
const navigateTo = vi.fn()
const wechatLogin = vi.fn((options: { success: (value: { code: string }) => void }) => options.success({ code: "wx-code" }))

function setup(): Page {
  const source = readFileSync(new URL("../src/pages/notifications/index.vue", import.meta.url), "utf8")
  const { descriptor } = parse(source)
  const compiled = compileScript(descriptor, { id: "notification-page" })
  const code = transpileModule(compiled.content, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
  const exports: { default?: { setup: (props: object, context: object) => Page } } = {}
  runInNewContext(code, { exports, Error, uni: { navigateTo, login: wechatLogin }, require: (name: string) => {
    if (name === "vue") return vue
    if (name === "@dcloudio/uni-app") return { onShow: vi.fn() }
    if (name.endsWith("api-error")) return { ApiError }
    if (name.endsWith("user-notification-api")) return { createUserNotificationApi: () => api, requestUserSubscriptions: requestSubscriptions }
    if (name.endsWith("wechat-token")) return { getEnrollmentDraftOwner: () => "family:family-a", getWechatSessionToken: () => token }
    if (name.endsWith("profile-display")) return { hasCompletedLocalProfile: () => true }
    if (name.endsWith("page-helpers")) return { readableError: (cause: unknown, fallback: string) => cause instanceof Error ? cause.message : fallback }
    return {}
  } })
  if (!exports.default) throw new Error("SFC compilation did not export a component")
  return exports.default.setup({}, { expose: vi.fn() })
}

beforeEach(() => {
  vi.clearAllMocks()
  token = "account-a"
  api.overview.mockResolvedValue(rows)
  api.subscribe.mockResolvedValue(rows)
  api.withdraw.mockResolvedValue(rows)
  requestSubscriptions.mockResolvedValue(mixed)
  wechatLogin.mockImplementation((options) => options.success({ code: "wx-code" }))
})

describe("global notification page", () => {
  it("does not select or authorize active types, but permits consumed types", async () => {
    const activeRows: readonly UserNotificationTemplate[] = rows.map((row, i) => ({ ...row, subscription: { id: `sub-${i}`, status: i === 0 ? "consumed" : "active", version: 1 } }))
    api.overview.mockResolvedValue(activeRows)
    const page = setup()
    await page.load()
    expect(page.selectedIds.value).toEqual(["type-0"])
    page.toggle("type-1")
    expect(page.selectedIds.value).toEqual(["type-0"])
    await page.subscribe()
    expect(requestSubscriptions).toHaveBeenCalledWith([activeRows[0]])
  })

  it("retries pending save after refreshed overview marks every type active", async () => {
    api.subscribe.mockRejectedValueOnce(new Error("response lost"))
    const page = setup()
    await page.load()
    await page.subscribe()
    api.overview.mockResolvedValue(rows.map((row) => ({ ...row, subscription: { id: row.id, status: "active", version: 1 } })))
    await page.load()
    expect(page.selected.value).toEqual([])
    await page.subscribe()
    expect(requestSubscriptions).toHaveBeenCalledTimes(1)
    expect(api.subscribe).toHaveBeenCalledTimes(2)
    expect(page.pendingChoices.value).toEqual([])
  })

  it.each(["overview", "subscribe", "withdraw"] as const)("returns to login when %s expires the session", async (operation) => {
    const page = setup()
    if (operation !== "overview") await page.load()
    api[operation].mockImplementationOnce(async () => { token = undefined; throw new ApiError(401, "expired") })
    if (operation === "overview") await page.load()
    else if (operation === "subscribe") await page.subscribe()
    else await page.withdraw({ id: "type", title: "活动", category: "activity", templateId: "wx", enabled: true, subscription: { id: "sub", status: "active", version: 1 } })
    expect(token).toBeUndefined()
    expect(page.authenticated.value).toBe(false)
    expect(page.templates.value).toEqual([])
    expect(page.pendingChoices.value).toEqual([])
    page.login()
    expect(navigateTo).toHaveBeenCalledWith({ url: "/pages/login/index?returnTo=%2Fpages%2Fnotifications%2Findex" })
  })

  it("offers login without requesting private data when logged out", async () => {
    token = undefined
    const page = setup()
    await page.load()
    expect(page.authenticated.value).toBe(false)
    expect(api.overview).not.toHaveBeenCalled()
    page.login()
    expect(navigateTo).toHaveBeenCalledWith({ url: "/pages/login/index?returnTo=%2Fpages%2Fnotifications%2Findex" })
  })

  it("loads and saves partial consent without an order or participant", async () => {
    const page = setup()
    await page.load()
    await page.subscribe()
    expect(api.subscribe).toHaveBeenCalledWith("wx-code", mixed)
    expect(page.message.value).toContain("已订阅1类提醒，后续提醒可通过微信接收。")
  })

  it("keeps rejected choices distinct from accepted subscriptions", async () => {
    requestSubscriptions.mockResolvedValue([{ templateId: "wx-0", result: "reject" }])
    const page = setup()
    await page.load()
    await page.subscribe()
    expect(page.message.value).toContain("本次未同意订阅")
  })

  it("retries a failed save without reopening WeChat consent", async () => {
    api.subscribe.mockRejectedValueOnce(new Error("offline"))
    const page = setup()
    await page.load()
    await page.subscribe()
    expect(page.pendingChoices.value).toEqual(mixed)
    await page.subscribe()
    expect(requestSubscriptions).toHaveBeenCalledTimes(1)
    expect(api.subscribe).toHaveBeenCalledTimes(2)
    expect(page.pendingChoices.value).toEqual([])
  })

  it("discards pending choices after switching accounts", async () => {
    api.subscribe.mockRejectedValueOnce(new Error("offline"))
    const page = setup()
    await page.load()
    await page.subscribe()
    token = "account-b"
    await page.load()
    expect(page.pendingChoices.value).toEqual([])
    await page.subscribe()
    expect(requestSubscriptions).toHaveBeenCalledTimes(2)
  })

  it("does not save an old consent if account switches during WeChat login", async () => {
    const page = setup()
    await page.load()
    wechatLogin.mockImplementationOnce((options) => { token = "account-b"; options.success({ code: "other-account" }) })
    await page.subscribe()
    expect(api.subscribe).not.toHaveBeenCalled()
    expect(page.pendingChoices.value).toEqual([])
  })

  it("clears private state on logout", async () => {
    api.subscribe.mockRejectedValueOnce(new Error("offline"))
    const page = setup()
    await page.load()
    await page.subscribe()
    token = undefined
    await page.load()
    expect(page.authenticated.value).toBe(false)
    expect(page.templates.value).toEqual([])
    expect(page.pendingChoices.value).toEqual([])
  })

  it("shows load failure and permits retry", async () => {
    api.overview.mockRejectedValueOnce(new Error("offline"))
    const page = setup()
    await page.load()
    expect(page.state.value).toBe("error")
    expect(page.error.value).toContain("offline")
    await page.load()
    expect(page.state.value).toBe("ready")
    expect(page.error.value).toBe("")
  })

  it("withdraws the selected subscription using its current version", async () => {
    const page = setup()
    await page.load()
    const item: UserNotificationTemplate = { id: "type", title: "活动", category: "activity", templateId: "wx", enabled: true, subscription: { id: "sub", status: "active", version: 4 } }
    await page.withdraw(item)
    expect(api.withdraw).toHaveBeenCalledWith("sub", 4)
    expect(page.message.value).toContain("已停止")
  })
})
