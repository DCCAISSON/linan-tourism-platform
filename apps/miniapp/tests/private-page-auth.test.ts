import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { compileScript, parse } from "vue/compiler-sfc"
import { ModuleKind, transpileModule } from "typescript"
import * as vue from "vue"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "../src/api-error"

type PrivatePage = {
  readonly authenticated: vue.Ref<boolean>
  readonly loginPrompt: vue.Ref<boolean>
  readonly members?: vue.Ref<readonly unknown[]>
  readonly orders?: vue.Ref<readonly unknown[]> | (() => void)
  readonly error: vue.Ref<string>
  readonly load: () => Promise<void>
  readonly requestLogin?: () => void
  readonly login: () => void
}
let token: string | undefined
let onShow: () => void
const api = {
  listEnrollmentMembers: vi.fn(async (): Promise<readonly unknown[]> => []),
  listSchools: vi.fn(async (): Promise<readonly { id: string; name: string }[]> => []),
  listGrades: vi.fn(async (_schoolId: string): Promise<readonly { id: string; name: string }[]> => []),
  listClasses: vi.fn(async (_gradeId: string): Promise<readonly { id: string; name: string }[]> => []),
  listOrders: vi.fn(async (): Promise<readonly unknown[]> => []),
  loginWithWechatCode: vi.fn(async () => undefined),
  loginWithWechatPhone: vi.fn(async () => ({ token: "logged-in-token", familyCode: "family-a", expiresAt: "2026-10-03T00:00:00.000Z", phoneVerified: true })),
  logoutWechat: vi.fn(async () => undefined),
}
const navigateTo = vi.fn()
const login = vi.fn()
const emit = vi.fn()
const showModal = vi.fn()
const switchTab = vi.fn()
const showToast = vi.fn()
const logoutSession = vi.fn(() => { token = undefined })

function setupSfc<T>(relativePath: string): T {
  const filename = new URL(`../src/${relativePath}`, import.meta.url)
  const source = readFileSync(filename, "utf8").replaceAll('import.meta.env["VITE_WECHAT_LOGIN_ENABLED"]', '"true"')
  const { descriptor } = parse(source)
  const compiled = compileScript(descriptor, { id: relativePath })
  const code = transpileModule(compiled.content, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
  const exports: Record<string, unknown> = {}
  const uni = { navigateTo, login, showToast, switchTab, showModal }
  runInNewContext(code, { exports, uni, Error, require: (name: string) => {
    if (name === "vue") return vue
    if (name === "@dcloudio/uni-app") return { onShow: (callback: () => void) => { onShow = callback } }
    if (name.endsWith("/api")) return { ApiError, createMiniappApi: () => api }
    if (name.endsWith("user-notification-api")) return { createUserNotificationApi: () => ({ overview: async () => [] }) }
    if (name.endsWith("wechat-token")) return { logoutWechatSession: logoutSession, getEnrollmentDraftOwner: () => "family:family-a", getWechatSessionToken: () => token, clearWechatSessionToken: () => { token = undefined } }
    if (name.endsWith("profile-display")) return { hasCompletedLocalProfile: () => true, loadLocalProfile: () => null }
    if (name.endsWith("page-helpers")) return { readableError: (cause: unknown, fallback: string) => cause instanceof Error ? cause.message : fallback }
    return {}
  } })
  const component = exports["default"] as { setup: (props: object, context: object) => T }
  return component.setup({}, { expose: () => undefined, emit })
}

beforeEach(() => {
  vi.clearAllMocks()
  token = undefined
  api.logoutWechat.mockResolvedValue(undefined)
  api.listEnrollmentMembers.mockResolvedValue([])
  api.listSchools.mockResolvedValue([])
  api.listGrades.mockResolvedValue([])
  api.listClasses.mockResolvedValue([])
  api.listOrders.mockResolvedValue([])
  api.loginWithWechatCode.mockImplementation(async () => { token = "logged-in-token" })
  api.loginWithWechatPhone.mockImplementation(async () => {
    token = "logged-in-token"
    return { token, familyCode: "family-a", expiresAt: "2026-10-03T00:00:00.000Z", phoneVerified: true }
  })
})

describe("settings logout", () => {
  type Settings = { readonly authenticated: vue.Ref<boolean>; readonly loggingOut: vue.Ref<boolean>; readonly logout: () => void }
  function confirmLogout(confirm = true): Promise<void> {
    const options: unknown = showModal.mock.calls.at(-1)?.[0]
    if (typeof options !== "object" || options === null || !("success" in options) || typeof options.success !== "function") throw new Error("Logout confirmation missing")
    return options.success({ confirm })
  }
  it("keeps the current session when logout is cancelled", async () => {
    token = "session-a"
    const page = setupSfc<Settings>("pages/settings/index.vue")
    onShow()
    page.logout()
    await confirmLogout(false)
    expect(token).toBe("session-a")
    expect(page.authenticated.value).toBe(true)
    expect(api.logoutWechat).not.toHaveBeenCalled()
    expect(logoutSession).not.toHaveBeenCalled()
  })
  it("waits for confirmation, revokes the session and returns to the guest profile", async () => {
    token = "session-a"
    const page = setupSfc<Settings>("pages/settings/index.vue")
    onShow()
    page.logout()
    expect(api.logoutWechat).not.toHaveBeenCalled()
    expect(logoutSession).not.toHaveBeenCalled()
    await confirmLogout()
    expect(api.logoutWechat).toHaveBeenCalledOnce()
    expect(token).toBeUndefined()
    expect(page.authenticated.value).toBe(false)
    expect(switchTab).toHaveBeenCalledWith({ url: "/pages/family/index" })
  })
  it("still clears local login when the server cannot be reached", async () => {
    token = "session-a"
    api.logoutWechat.mockRejectedValueOnce(new Error("offline"))
    const page = setupSfc<Settings>("pages/settings/index.vue")
    onShow()
    page.logout()
    await confirmLogout()
    expect(token).toBeUndefined()
    expect(page.authenticated.value).toBe(false)
    expect(page.loggingOut.value).toBe(false)
    expect(showToast).toHaveBeenCalledWith({ title: "已退出本机，登录状态暂未同步", icon: "none" })
  })
  it("does not clear a new login when an earlier logout finishes", async () => {
    token = "session-a"
    let finish: (() => void) | undefined
    api.logoutWechat.mockImplementationOnce(() => new Promise((resolve) => { finish = () => resolve(undefined) }))
    const page = setupSfc<Settings>("pages/settings/index.vue")
    onShow()
    page.logout()
    const pending = confirmLogout()
    expect(token).toBeUndefined()
    expect(logoutSession).toHaveBeenCalledOnce()
    expect(switchTab).toHaveBeenCalledWith({ url: "/pages/family/index" })
    token = "session-b"
    finish?.()
    await pending
    expect(token).toBe("session-b")
    expect(logoutSession).toHaveBeenCalledOnce()
    expect(page.loggingOut.value).toBe(false)
  })
})

it("loads shared school labels once per family refresh and reads fresh labels again", async () => {
  token = "session-a"
  const page = setupSfc<PrivatePage>("pages/family/index.vue")
  page.authenticated.value = true
  api.listEnrollmentMembers.mockResolvedValue([
    { id: "child-a", participantKind: "student", schoolId: "school-a", gradeId: "grade-a", classId: "class-a" },
    { id: "child-b", participantKind: "student", schoolId: "school-a", gradeId: "grade-a", classId: "class-b" },
    { id: "child-c", participantKind: "student", schoolId: "school-b", gradeId: "grade-b", classId: "class-c" },
    { id: "adult-a", participantKind: "adult", schoolId: "school-c", gradeId: null, classId: null },
  ])
  api.listSchools.mockResolvedValue([{ id: "school-a", name: "演示甲校" }, { id: "school-b", name: "演示乙校" }])
  api.listGrades.mockImplementation(async id => [{ id: id === "school-a" ? "grade-a" : "grade-b", name: "五年级" }])
  api.listClasses.mockImplementation(async id => id === "grade-a" ? [{ id: "class-a", name: "一班" }, { id: "class-b", name: "二班" }] : [{ id: "class-c", name: "三班" }])
  await page.load()
  expect(api.listGrades.mock.calls).toEqual([["school-a"], ["school-b"]])
  expect(api.listClasses.mock.calls).toEqual([["grade-a"], ["grade-b"]])
  expect(page.members?.value).toEqual([
    expect.objectContaining({ id: "child-a", schoolName: "演示甲校", gradeName: "五年级", className: "一班" }),
    expect.objectContaining({ id: "child-b", schoolName: "演示甲校", gradeName: "五年级", className: "二班" }),
    expect.objectContaining({ id: "child-c", schoolName: "演示乙校", gradeName: "五年级", className: "三班" }),
    expect.objectContaining({ id: "adult-a", schoolName: "成人参加人" }),
  ])
  api.listClasses.mockResolvedValue([{ id: "class-a", name: "更新后一班" }])
  await page.load()
  expect(api.listGrades).toHaveBeenCalledTimes(4)
  expect(api.listClasses).toHaveBeenCalledTimes(4)
  expect(page.members?.value[0]).toMatchObject({ className: "更新后一班" })
})

describe.each(["family", "orders"])("%s private page", (pageName) => {
  it("allows guest onShow without navigation, login or private requests", () => {
    const page = setupSfc<PrivatePage>(`pages/${pageName}/index.vue`)
    onShow()
    expect(page.authenticated.value).toBe(false)
    expect(page.loginPrompt.value).toBe(false)
    expect(navigateTo).not.toHaveBeenCalled()
    expect(api.listOrders).not.toHaveBeenCalled()
    expect(api.listEnrollmentMembers).not.toHaveBeenCalled()
    expect(login).not.toHaveBeenCalled()
  })

  it("clears private rows after a 401 and permits a later authenticated retry", async () => {
    const page = setupSfc<PrivatePage>(`pages/${pageName}/index.vue`)
    token = "expired-token"
    page.authenticated.value = true
    const rows = page.members ?? (typeof page.orders === "object" ? page.orders : undefined)
    if (!rows) throw new Error("Missing private rows")
    rows.value = [{ id: "previous-private-row" }]
    const request = pageName === "family" ? api.listEnrollmentMembers : api.listOrders
    request.mockImplementationOnce(async () => { token = undefined; throw new ApiError(401, "expired") })
    await page.load()
    expect(rows.value).toEqual([])
    expect(token).toBeUndefined()
    expect(page.authenticated.value).toBe(false)
    expect(page.error.value).toContain(pageName === "family" ? "登录已失效，请重新登录后查看。" : "登录已过期，请重新登录后查看。")
    expect(navigateTo).not.toHaveBeenCalled()
    await page.load()
    expect(request).toHaveBeenCalledTimes(1)
    token = "renewed-token"
    page.authenticated.value = true
    await page.load()
    expect(page.error.value).toBe("")
    expect(request).toHaveBeenCalledTimes(2)
  })
  it("ignores an older successful response after current authentication expires", async () => {
    const page = setupSfc<PrivatePage>(`pages/${pageName}/index.vue`)
    token = "token-a"
    page.authenticated.value = true
    let resolveOld: (rows: readonly unknown[]) => void = () => { throw new Error("Request did not start") }
    const request = pageName === "family" ? api.listEnrollmentMembers : api.listOrders
    request.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
    const oldLoad = page.load()
    request.mockImplementationOnce(async () => { token = undefined; throw new ApiError(401, "expired") })
    await page.load()
    resolveOld([{ id: "old-private", participantKind: "adult" }])
    await oldLoad
    const rows = page.members ?? (typeof page.orders === "object" ? page.orders : undefined)
    expect(rows?.value).toEqual([])
    expect(page.authenticated.value).toBe(false)
  })
  it("does not discard a new login when an old request rejects", async () => {
    const page = setupSfc<PrivatePage>(`pages/${pageName}/index.vue`)
    token = "token-a"
    page.authenticated.value = true
    let rejectOld: (cause: Error) => void = () => { throw new Error("Request did not start") }
    const request = pageName === "family" ? api.listEnrollmentMembers : api.listOrders
    request.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject }))
    const oldLoad = page.load()
    token = "token-b"
    await page.load()
    rejectOld(new ApiError(401, "old token expired"))
    await oldLoad
    expect(token).toBe("token-b")
    expect(page.authenticated.value).toBe(true)
    expect(page.error.value).toBe("")
  })
})

describe("explicit WeChat phone authorization", () => {
  type Consent = { accepted: vue.Ref<boolean>; busy: vue.Ref<boolean>; error: vue.Ref<string>; loginWithWechatPhone: (event: { detail?: { code?: unknown } }) => Promise<void> }
  it("never invokes WeChat login until consent is checked", async () => {
    const consent = setupSfc<Consent>("components/WechatConsent.vue")
    expect(consent.accepted.value).toBe(false)
    await consent.loginWithWechatPhone({ detail: { code: "phone-code" } })
    expect(login).not.toHaveBeenCalled()
    consent.accepted.value = true
    login.mockImplementationOnce((options: UniApp.LoginOptions) => options.success?.({ code: "wechat-code", errMsg: "login:ok", authResult: "" }))
    await consent.loginWithWechatPhone({ detail: { code: "phone-code" } })
    expect(api.loginWithWechatPhone).toHaveBeenCalledWith("wechat-code", "phone-code")
    expect(emit).toHaveBeenCalledWith("authenticated")
  })
  it("recovers from cancelled login and failed network without emitting success", async () => {
    const consent = setupSfc<Consent>("components/WechatConsent.vue")
    consent.accepted.value = true
    login.mockImplementationOnce((options: UniApp.LoginOptions) => options.fail?.({ errMsg: "login:fail cancel" }))
    await consent.loginWithWechatPhone({ detail: { code: "phone-code" } })
    expect(consent.busy.value).toBe(false)
    expect(consent.error.value).toContain("微信手机号登录失败，请重新授权。")
    expect(emit).not.toHaveBeenCalled()
    login.mockImplementation((options: UniApp.LoginOptions) => options.success?.({ code: "wechat-code", errMsg: "login:ok", authResult: "" }))
    api.loginWithWechatPhone.mockRejectedValueOnce(new Error("网络连接失败"))
    await consent.loginWithWechatPhone({ detail: { code: "phone-code" } })
    expect(consent.error.value).toBe("网络连接失败")
    expect(emit).not.toHaveBeenCalled()
    await consent.loginWithWechatPhone({ detail: { code: "phone-code" } })
    expect(consent.error.value).toBe("")
    expect(emit).toHaveBeenCalledWith("authenticated")
  })
  it("does not emit login events when a delayed phone response is discarded after account change", async () => {
    const consent = setupSfc<Consent>("components/WechatConsent.vue")
    consent.accepted.value = true
    login.mockImplementationOnce((options: UniApp.LoginOptions) => options.success?.({ code: "wechat-code", errMsg: "login:ok", authResult: "" }))
    api.loginWithWechatPhone.mockImplementationOnce(async () => {
      token = "new-account-token"
      throw new ApiError(409, "登录状态已变化，请重新确认手机号。")
    })
    await consent.loginWithWechatPhone({ detail: { code: "phone-code" } })
    expect(token).toBe("new-account-token")
    expect(emit).not.toHaveBeenCalledWith("identified", expect.anything(), expect.anything())
    expect(emit).not.toHaveBeenCalledWith("authenticated")
  })
})
