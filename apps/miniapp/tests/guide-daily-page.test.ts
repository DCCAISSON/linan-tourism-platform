import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { compileScript, compileTemplate, parse } from "vue/compiler-sfc"
import { ModuleKind, transpileModule } from "typescript"
import * as vue from "vue"
import { renderToString } from "vue/server-renderer"
import { beforeEach, describe, expect, it, vi } from "vitest"
import * as dailyApi from "../src/guide-daily-api"
import { useGuideDaily } from "../src/guide-daily-state"
import type { GuideSession } from "../src/guide-execution-api"

type Page = ReturnType<typeof useGuideDaily> & { readonly sessionId: vue.Ref<string>; readonly back: () => void }
const session: GuideSession = { id: "s1", code: "研学一团", startsAt: "2026-10-09T00:00:00Z", endsAt: "2026-10-10T00:00:00Z", vehicleIds: ["v1"], confirmationStatus: "current", vehicles: [], people: [{ personRef: "paid:p1", displayName: "张同学", className: "一班", active: true, inactiveReason: null, vehicleId: "v1", healthAuthorized: true }], groupPeople: [], events: [] }
const report: dailyApi.PersonDailyReport = { id: "daily1", tourSessionId: "s1", personRef: "paid:p1", reportDate: "2026-10-09", version: 2, lodgingCheck: "", mealStatus: "", breakfast: null, lunch: "recorded", dinner: "not_applicable", breakfastNote: "", lunchNote: "按时用餐", dinnerNote: "返程不含晚餐", bodyStatus: "PRIVATE_BODY", note: "PRIVATE_NOTE", healthReadable: true, publicSummary: "UNAPPROVED_SUMMARY", publicApproved: false, updatedAt: "2026-10-09T08:00:00Z" }
let permissions: readonly string[] = []
let hide = () => {}, unload = () => {}
let onLoad = (_query: Record<string, string>) => {}
const redirectTo = vi.fn()
const navigateBack = vi.fn<(options: { delta: number; fail: () => void }) => void>()
const { descriptor } = parse(readFileSync(new URL("../src/pages/guide/daily.vue", import.meta.url), "utf8"))
const script = compileScript(descriptor, { id: "guide-daily" })
const code = transpileModule(script.content, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText

function setup(): Page {
  const exports: Record<string, unknown> = {}
  runInNewContext(code, { exports, Error, uni: { redirectTo, navigateBack }, require: (name: string) => {
    if (name === "vue") return vue
    if (name === "@dcloudio/uni-app") return { onLoad: (callback: typeof onLoad) => { onLoad = callback }, onShow: () => {}, onHide: (callback: () => void) => { hide = callback }, onUnload: (callback: () => void) => { unload = callback } }
    if (name.endsWith("staff-api")) return { createStaffApi: () => ({ me: async () => ({ actorId: "g1", forcePasswordChange: false, permissionKeys: permissions }) }) }
    if (name.endsWith("staff-session")) return { getStaffSessionToken: () => "staff-a" }
    if (name.endsWith("guide-execution-api")) return { createGuideApi: () => ({ getSession: async () => session }) }
    if (name.endsWith("guide-daily-api")) return { ...dailyApi, createGuideDailyApi: () => ({ list: async () => [report], save: async () => {}, approve: async () => {}, history: async () => [] }) }
    if (name.endsWith("guide-daily-state")) return { useGuideDaily }
    if (name.endsWith("DailyHistory.vue")) return { default: vue.defineComponent({ setup: () => () => null }) }
    throw new Error(`Unexpected import ${name}`)
  } })
  const component = exports["default"]
  if (!isComponent(component)) throw new Error("Compiled daily page missing setup")
  const page = component.setup({}, { expose: () => {} })
  onLoad({ id: "s1" })
  return page
}
function isComponent(value: unknown): value is { setup: (props: object, context: object) => Page } { return typeof value === "object" && value !== null && "setup" in value && typeof value.setup === "function" }
async function render(page: Page): Promise<string> {
  const template = compileTemplate({ source: descriptor.template?.content ?? "", filename: "daily.vue", id: "guide-daily", compilerOptions: { bindingMetadata: script.bindings ?? {}, isCustomElement: tag => ["view", "text", "button", "picker"].includes(tag) } })
  const exports: Record<string, unknown> = {}
  runInNewContext(transpileModule(template.code, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText, { exports, require: () => vue })
  const compiledRender = exports["render"]
  if (typeof compiledRender !== "function") throw new Error("Daily template missing render")
  return renderToString(vue.createSSRApp({ setup: () => page, render: compiledRender }))
}
beforeEach(() => { permissions = ["execution.read", "execution.write", "health.read"]; vi.clearAllMocks() })

describe("guide participant daily page", () => {
  it.each(["hide", "unload"])("clears selected private drafts when the page receives %s", async lifecycle => {
    const page = setup()
    await page.load(page.sessionId.value)
    page.select("paid:p1", "2026-10-09")
    if (lifecycle === "hide") hide(); else unload()
    expect(page.state.form.bodyStatus).toBe("")
    expect(page.state.form.note).toBe("")
    expect(page.state.reports).toEqual([])
    expect(page.state.personRef).toBe("")
  })
  it("renders pending approval without exposing an unapproved summary or an approval button", async () => {
    const page = setup()
    await page.load("s1")
    page.select("paid:p1", "2026-10-09")
    const html = await render(page)
    expect(html).toContain("公开摘要待审批")
    expect(html).not.toContain("UNAPPROVED_SUMMARY")
    expect(html).not.toContain(">批准公开摘要<")
    expect(html).toContain("更正原因")
  })
  it("omits health inputs and values when the account lacks health permission", async () => {
    permissions = ["execution.read", "execution.write"]
    const page = setup()
    await page.load("s1")
    page.select("paid:p1", "2026-10-09")
    const html = await render(page)
    expect(html).not.toContain("PRIVATE_BODY")
    expect(html).not.toContain("PRIVATE_NOTE")
    expect(html).not.toContain("填写当日身体情况")
    expect(html).toContain("保存餐饮记录会保留已有私密内容")
  })
  it("returns to the preceding execution page without adding a page to the stack", () => {
    const page = setup()
    page.back()
    expect(navigateBack).toHaveBeenCalledWith({ delta: 1, fail: expect.any(Function) })
    expect(redirectTo).not.toHaveBeenCalled()
  })
  it("opens the execution page if no preceding page is available", () => {
    const page = setup()
    navigateBack.mockImplementationOnce(options => options.fail())
    page.back()
    expect(redirectTo).toHaveBeenCalledWith({ url: "/pages/guide/session?id=s1" })
  })
})
