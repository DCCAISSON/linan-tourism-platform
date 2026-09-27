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
  listSchools: vi.fn(async () => []),
  listOrders: vi.fn(async (): Promise<readonly unknown[]> => []),
  loginWithWechatCode: vi.fn(async () => undefined),
}
const navigateTo = vi.fn()
const login = vi.fn()
const emit = vi.fn()

function setupSfc<T>(relativePath: string): T {
  const filename = new URL(`../src/${relativePath}`, import.meta.url)
  const source = readFileSync(filename, "utf8").replaceAll('import.meta.env["VITE_WECHAT_LOGIN_ENABLED"]', '"true"')
  const { descriptor } = parse(source)
  const compiled = compileScript(descriptor, { id: relativePath })
  const code = transpileModule(compiled.content, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
  const exports: Record<string, unknown> = {}
  const uni = { navigateTo, login, switchTab: vi.fn() }
  runInNewContext(code, { exports, uni, Error, require: (name: string) => {
    if (name === "vue") return vue
    if (name === "@dcloudio/uni-app") return { onShow: (callback: () => void) => { onShow = callback } }
    if (name.endsWith("/api")) return { ApiError, createMiniappApi: () => api }
    if (name.endsWith("wechat-token")) return { getWechatSessionToken: () => token, clearWechatSessionToken: () => { token = undefined } }
    if (name.endsWith("page-helpers")) return { readableError: (cause: unknown, fallback: string) => cause instanceof Error ? cause.message : fallback }
    return {}
  } })
  const component = exports["default"] as { setup: (props: object, context: object) => T }
  return component.setup({}, { expose: () => undefined, emit })
}

beforeEach(() => {
  vi.clearAllMocks()
  token = undefined
  api.listEnrollmentMembers.mockResolvedValue([])
  api.listOrders.mockResolvedValue([])
  api.loginWithWechatCode.mockResolvedValue(undefined)
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
    expect(page.error.value).toContain("登录已过期")
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

describe("explicit WeChat identity consent", () => {
  type Consent = { accepted: vue.Ref<boolean>; busy: vue.Ref<boolean>; error: vue.Ref<string>; login: () => Promise<void> }
  it("never invokes WeChat login until consent is checked", async () => {
    const consent = setupSfc<Consent>("components/WechatConsent.vue")
    expect(consent.accepted.value).toBe(false)
    await consent.login()
    expect(login).not.toHaveBeenCalled()
    consent.accepted.value = true
    login.mockImplementationOnce((options: UniApp.LoginOptions) => options.success?.({ code: "wechat-code", errMsg: "login:ok", authResult: "" }))
    await consent.login()
    expect(api.loginWithWechatCode).toHaveBeenCalledWith("wechat-code")
    expect(emit).toHaveBeenCalledWith("authenticated")
  })
  it("recovers from cancelled login and failed network without emitting success", async () => {
    const consent = setupSfc<Consent>("components/WechatConsent.vue")
    consent.accepted.value = true
    login.mockImplementationOnce((options: UniApp.LoginOptions) => options.fail?.({ errMsg: "login:fail cancel" }))
    await consent.login()
    expect(consent.busy.value).toBe(false)
    expect(consent.error.value).toContain("微信登录失败")
    expect(emit).not.toHaveBeenCalled()
    login.mockImplementation((options: UniApp.LoginOptions) => options.success?.({ code: "wechat-code", errMsg: "login:ok", authResult: "" }))
    api.loginWithWechatCode.mockRejectedValueOnce(new Error("网络连接失败"))
    await consent.login()
    expect(consent.error.value).toBe("网络连接失败")
    expect(emit).not.toHaveBeenCalled()
    await consent.login()
    expect(consent.error.value).toBe("")
    expect(emit).toHaveBeenCalledWith("authenticated")
  })
})
