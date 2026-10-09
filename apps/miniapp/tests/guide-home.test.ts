import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { compileScript, parse } from "vue/compiler-sfc"
import { ModuleKind, transpileModule } from "typescript"
import * as vue from "vue"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "../src/api-error"
import type { StaffSession } from "../src/staff-session"
import type { StaffAccess } from "../src/staff-api"

type Home = {
  readonly username: vue.Ref<string>; readonly password: vue.Ref<string>; readonly newPassword: vue.Ref<string>; readonly confirmation: vue.Ref<string>
  readonly sessions: vue.Ref<readonly unknown[]>; readonly authenticated: vue.Ref<boolean>; readonly forceChange: vue.Ref<boolean>
  readonly allowed: vue.Ref<boolean>; readonly error: vue.Ref<string>; readonly message: vue.Ref<string>; readonly busy: vue.Ref<boolean>
  readonly load: () => Promise<void>; readonly login: () => Promise<void>; readonly logout: () => Promise<void>; readonly changePassword: () => Promise<void>
}
const sample: StaffSession = { token: "staff-a", expiresAt: "2099-01-01T00:00:00Z", account: { id: "a", username: "guide-a", displayName: "导游甲", forcePasswordChange: false } }
const access: StaffAccess = { actorId: "a", forcePasswordChange: false, permissionKeys: ["execution.read", "execution.write"] }
const sampleSessions = [{ id: "trip-a", code: "研学甲团", startsAt: "2026-10-15T00:00:00Z", endsAt: "2026-10-16T00:00:00Z", vehicleIds: ["vehicle-a"] }]
let stored: StaffSession | undefined
let consent = true
let hidden = () => {}
let confirmLogout: ((result: { confirm: boolean }) => void) | undefined
const staff = { me: vi.fn(async () => access), login: vi.fn(async () => sample), logout: vi.fn(async () => { stored = undefined }), changePassword: vi.fn(async () => { stored = undefined }) }
const listSessions = vi.fn(async () => sampleSessions)
const saveSession = vi.fn((value: StaffSession) => { stored = value })

function setup(): Home {
  const file = new URL("../src/pages/guide/index.vue", import.meta.url)
  const { descriptor } = parse(readFileSync(file, "utf8"))
  const compiled = compileScript(descriptor, { id: "guide-home" })
  const code = transpileModule(compiled.content, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
  const exports: Record<string, unknown> = {}
  runInNewContext(code, { exports, Error, uni: { showModal: (options: { success: typeof confirmLogout }) => { confirmLogout = options.success }, switchTab: vi.fn(), navigateTo: vi.fn() }, require: (name: string) => {
    if (name === "vue") return vue
    if (name === "@dcloudio/uni-app") return { onShow: () => {}, onHide: (callback: () => void) => { hidden = callback }, onUnload: () => {} }
    if (name.endsWith("staff-api")) return { createStaffApi: () => staff }
    if (name.endsWith("staff-session")) return { getStaffSession: () => stored, getStaffSessionToken: () => stored?.token, saveStaffSession: saveSession }
    if (name.endsWith("service-consent")) return { hasServiceConsent: () => consent, clearServiceConsent: () => { consent = false } }
    if (name.endsWith("guide-execution-api")) return { createGuideApi: () => ({ listSessions }) }
    if (name.endsWith("api-error")) return { ApiError }
    return {}
  } })
  const component = exports["default"]
  if (!isComponent(component)) throw new Error("Compiled guide page missing setup")
  return component.setup({}, { expose: () => {} })
}
function isComponent(value: unknown): value is { setup: (props: object, context: object) => Home } {
  return typeof value === "object" && value !== null && "setup" in value && typeof value.setup === "function"
}
beforeEach(() => {
  vi.clearAllMocks(); stored = undefined; consent = true; confirmLogout = undefined
  staff.me.mockResolvedValue(access); staff.login.mockResolvedValue(sample); listSessions.mockResolvedValue(sampleSessions)
  staff.logout.mockImplementation(async () => { stored = undefined })
  staff.changePassword.mockImplementation(async () => { stored = undefined })
})

describe("guide workspace login lifecycle", () => {
  it("does not allow collecting login credentials before privacy confirmation", async () => {
    consent = false
    const page = setup(); page.username.value = "guide-a"; page.password.value = "synthetic-input"
    await page.login()
    expect(staff.login).not.toHaveBeenCalled()
  })
  it("loads only assigned sessions after independent staff login", async () => {
    const page = setup(); page.username.value = " guide-a "; page.password.value = "synthetic-input"
    await page.login()
    expect(staff.login).toHaveBeenCalledWith("guide-a", "synthetic-input")
    expect(page.sessions.value).toEqual(sampleSessions)
    expect(page.password.value).toBe("")
    expect(page.authenticated.value).toBe(true)
    expect(page.busy.value).toBe(false)
  })
  it("forces a temporary password change before requesting any guide roster", async () => {
    stored = sample; staff.me.mockResolvedValue({ ...access, forcePasswordChange: true })
    const page = setup(); await page.load()
    expect(page.forceChange.value).toBe(true)
    expect(listSessions).not.toHaveBeenCalled()
    page.password.value = "synthetic-input"; page.newPassword.value = "synthetic-new-input"; page.confirmation.value = page.newPassword.value
    await page.changePassword()
    expect(page.authenticated.value).toBe(false)
    expect(page.message.value).toContain("使用新密码登录")
    expect(page.newPassword.value).toBe("")
  })
  it("does not fetch a list if execution permission is missing", async () => {
    stored = sample; staff.me.mockResolvedValue({ ...access, permissionKeys: [] })
    const page = setup(); await page.load()
    expect(page.allowed.value).toBe(false)
    expect(page.error.value).toContain("权限")
    expect(listSessions).not.toHaveBeenCalled()
  })
  it("does not persist a login response after leaving the page", async () => {
    let resolveLogin: ((value: StaffSession) => void) | undefined
    staff.login.mockImplementation(() => new Promise(resolve => { resolveLogin = resolve }))
    const page = setup(); page.username.value = "guide-a"; page.password.value = "synthetic-input"
    const pending = page.login(); hidden(); resolveLogin?.(sample); await pending
    expect(saveSession).not.toHaveBeenCalled()
    expect(page.password.value).toBe("")
  })
  it("discards a delayed list and clears sensitive visible data on hide", async () => {
    stored = sample
    const page = setup(); await page.load()
    let resolveList: ((value: typeof sampleSessions) => void) | undefined
    listSessions.mockImplementation(() => new Promise(resolve => { resolveList = resolve }))
    const pending = page.load(); await Promise.resolve(); hidden(); resolveList?.(sampleSessions); await pending
    expect(page.sessions.value).toEqual([])
  })
  it("an expired current session returns to login and clears rows", async () => {
    stored = sample; const page = setup(); await page.load()
    staff.me.mockImplementation(async () => { stored = undefined; throw new ApiError(401, "登录已失效") })
    await page.load()
    expect(page.authenticated.value).toBe(false)
    expect(page.sessions.value).toEqual([])
    expect(page.error.value).toContain("失效")
  })
  it("a logout confirmation opened before account switch cannot log out the next account", async () => {
    stored = sample; const page = setup(); await page.load()
    const pending = page.logout()
    hidden(); stored = { ...sample, token: "staff-b" }; confirmLogout?.({ confirm: true }); await pending
    expect(staff.logout).not.toHaveBeenCalled()
    expect(stored.token).toBe("staff-b")
  })
  it("explicit logout clears rows and resets privacy confirmation", async () => {
    stored = sample; const page = setup(); await page.load()
    const pending = page.logout(); confirmLogout?.({ confirm: true }); await pending
    expect(staff.logout).toHaveBeenCalledOnce()
    expect(page.sessions.value).toEqual([])
    expect(page.authenticated.value).toBe(false)
    expect(consent).toBe(false)
  })
})
