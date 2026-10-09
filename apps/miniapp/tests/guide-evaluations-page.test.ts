import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { ModuleKind, transpileModule } from "typescript"
import { compileScript, parse } from "vue/compiler-sfc"
import * as vue from "vue"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { RequestTransport } from "../src/api-types"
import { createStaffApi } from "../src/staff-api"
import { getStaffSessionToken, saveStaffSession } from "../src/staff-session"
import { createGuideApi } from "../src/guide-execution-api"
import { createGuideEvaluationsApi } from "../src/guide-evaluations-api"
import { useGuideEvaluations } from "../src/guide-evaluations-state"

type Page = ReturnType<typeof useGuideEvaluations> & { readonly sessionId: vue.Ref<string>; readonly askConfirm: () => Promise<void>; readonly back: () => void }
const student = { personRef: "paid:p1", displayName: "张同学", gradeName: "三年级", className: "一班" }
const evaluation = { ...student, id: "eval1", version: 1, organizationId: "org1", standardId: "std1", gradeCode: "A", gradeLabel: "优秀", internalComment: "", excellent: false, attention: false, confirmedAt: null, dimensionObservations: [] }
const standard = { id: "std1", tourSessionId: "s1", title: "研学评价", version: 1, confirmedAt: "2026-10-09T01:00:00Z", items: [{ code: "A", label: "优秀", description: "" }, { code: "B", label: "合格", description: "" }], dimensions: [] }
const storage = new Map<string, unknown>()
const request = vi.fn<RequestTransport>()
const navigateBack = vi.fn<(options: { delta: number; fail: () => void }) => void>()
const redirectTo = vi.fn()
const options = { baseUrl: "https://api.example.test", request }
let hidden: () => void = () => {}
let unloaded: () => void = () => {}
let dialog: { title: string; content: string; success: (result: { confirm: boolean }) => void } | undefined
let rows: readonly unknown[] = []

function setup(): Page {
  const { descriptor } = parse(readFileSync(new URL("../src/pages/guide/evaluations.vue", import.meta.url), "utf8"))
  const compiled = compileScript(descriptor, { id: "guide-evaluations" })
  const code = transpileModule(compiled.content, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
  const exports: Record<string, unknown> = {}
  runInNewContext(code, { exports, Error, uni: { showModal: (value: typeof dialog) => { dialog = value }, navigateBack, redirectTo }, require: (name: string) => {
    if (name === "vue") return vue
    if (name === "@dcloudio/uni-app") return { onLoad: (callback: (query: object) => void) => callback({ id: "s1" }), onShow: () => {}, onHide: (callback: () => void) => { hidden = callback }, onUnload: (callback: () => void) => { unloaded = callback } }
    if (name.endsWith("staff-api")) return { createStaffApi: () => createStaffApi(options) }
    if (name.endsWith("staff-session")) return { getStaffSessionToken }
    if (name.endsWith("guide-execution-api")) return { createGuideApi: () => createGuideApi(options) }
    if (name.endsWith("guide-evaluations-api")) return { createGuideEvaluationsApi: () => createGuideEvaluationsApi(options) }
    if (name.endsWith("guide-evaluations-state")) return { useGuideEvaluations }
    throw new Error(`未知模块：${name}`)
  } })
  const component = exports["default"]
  if (!isComponent(component)) throw new Error("评价页面未生成")
  return component.setup({}, { expose: () => {} })
}
function isComponent(value: unknown): value is { setup: (props: object, context: object) => Page } {
  return typeof value === "object" && value !== null && "setup" in value && typeof value.setup === "function"
}
beforeEach(() => {
  storage.clear(); request.mockReset(); navigateBack.mockReset(); redirectTo.mockReset(); dialog = undefined; rows = []
  vi.stubGlobal("uni", { getStorageSync: (key: string) => storage.get(key), setStorageSync: (key: string, value: unknown) => storage.set(key, value), removeStorageSync: (key: string) => storage.delete(key) })
  saveStaffSession({ token: "staff-a", expiresAt: "2099-01-01T00:00:00Z", account: { id: "guide-a", username: "guide-a", displayName: "导游甲", forcePasswordChange: false } })
  request.mockImplementation(async input => {
    if (input.url.endsWith("/staff/auth/me")) return { statusCode: 200, data: { actorId: "guide-a", forcePasswordChange: false, permissionKeys: ["execution.read", "evaluations.read", "evaluations.write", "evaluations.confirm"] } }
    if (input.url.endsWith("/staff/execution/sessions/s1")) return { statusCode: 200, data: { id: "s1", code: "QYX-01", startsAt: "2026-10-09T00:00:00Z", endsAt: "2026-10-10T00:00:00Z", vehicleIds: ["v1"], vehicles: [], confirmationStatus: "current", people: [{ ...student, vehicleId: "v1", active: true, inactiveReason: null, healthAuthorized: false }], groupPeople: [], events: [] } }
    if (input.url.endsWith("/evaluations/staff/sessions/s1")) return { statusCode: 200, data: { organizationId: "org1", students: [student], standards: [standard], evaluations: rows } }
    if (input.url.endsWith("/evaluations/staff/batch")) { rows = [evaluation]; return { statusCode: 201, data: rows } }
    if (input.url.endsWith("/confirm")) { rows = [{ ...evaluation, confirmedAt: "2026-10-09T02:00:00Z" }]; return { statusCode: 201, data: rows } }
    throw new Error(`未预期的请求：${input.url}`)
  })
})

describe("guide evaluation page lifecycle", () => {
  it("returns to the existing session page without growing the navigation stack", () => {
    const page = setup()
    page.back()
    expect(navigateBack).toHaveBeenCalledWith({ delta: 1, fail: expect.any(Function) })
    expect(redirectTo).not.toHaveBeenCalled()
  })
  it("replaces a directly opened evaluation page when no previous page exists", () => {
    const page = setup()
    navigateBack.mockImplementation(options => { options.fail() })
    page.back()
    expect(redirectTo).toHaveBeenCalledWith({ url: "/pages/guide/session?id=s1" })
  })
  it("loads its query session and saves a chosen grade through the real API adapter", async () => {
    const page = setup()
    await page.load(page.sessionId.value)
    page.edit("paid:p1")
    page.selectStandard("std1")
    if (!page.state.form) throw new Error("评价表单未打开")
    page.state.form.gradeCode = "A"
    await page.save()
    expect(page.state.notice).toBe("评价已保存，待授权人员确认。")
    expect(request.mock.calls.find(([input]) => input.method === "POST")?.[0]).toMatchObject({ header: { Authorization: "Staff staff-a" }, data: { observations: [expect.objectContaining({ personRef: "paid:p1", gradeCode: "A" })] } })
  })
  it("explicitly confirms the full group after the dialog is approved", async () => {
    rows = [evaluation]
    const page = setup()
    await page.load("s1")
    const pending = page.askConfirm()
    expect(dialog?.title).toBe("确认全团评价")
    expect(dialog?.content).toContain("含其他车辆")
    dialog?.success({ confirm: true })
    await pending
    expect(page.state.notice).toBe("全团学生评价已确认。")
    expect(request.mock.calls.filter(([input]) => input.method === "POST")).toHaveLength(1)
  })
  it.each(["hide", "unload"])("clears a visible student's notes on %s", async action => {
    const page = setup()
    await page.load("s1")
    page.edit("paid:p1")
    if (!page.state.form) throw new Error("评价表单未打开")
    page.state.form.internalComment = "个人观察"
    if (action === "hide") hidden(); else unloaded()
    expect(page.state.dashboard).toBeNull()
    expect(page.state.form).toBeNull()
    expect(storage.size).toBe(1)
  })
  it("cannot submit an old confirmation dialog after hiding and re-entering", async () => {
    rows = [evaluation]
    const page = setup()
    await page.load("s1")
    const pending = page.askConfirm()
    hidden()
    await page.load("s1")
    dialog?.success({ confirm: true })
    await pending
    expect(request.mock.calls.filter(([input]) => input.method === "POST")).toHaveLength(0)
    expect(page.state.notice).toBe("")
  })
})
