import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { compileScript, compileTemplate, parse } from "vue/compiler-sfc"
import { ModuleKind, transpileModule } from "typescript"
import * as vue from "vue"
import { renderToString } from "vue/server-renderer"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "../src/api-error"
import type { FamilyInsuranceResponse } from "../src/insurance-api"
import { familyInsurance, insurancePlan, insuranceRecord } from "./insurance-fixture"

type Page = {
  readonly orderId: vue.Ref<string>
  readonly insurance: vue.Ref<FamilyInsuranceResponse | null>
  readonly state: vue.Ref<string>
  readonly error: vue.Ref<string>
  readonly needsLogin: vue.Ref<boolean>
  readonly expandedPlans: vue.Ref<ReadonlySet<string>>
  readonly load: () => Promise<void>
  readonly togglePlan: (key: string) => void
  readonly login: () => void
}
const getInsurance = vi.fn<(orderId: string) => Promise<FamilyInsuranceResponse>>()
const navigateTo = vi.fn()
let token: string | undefined
let owner: string
let hide = () => {}, unload = () => {}
let show: () => void | Promise<void> = () => {}
let loaded = (_query: Record<string, string>) => {}
const { descriptor } = parse(readFileSync(new URL("../src/pages/orders/insurance.vue", import.meta.url), "utf8"))
const script = compileScript(descriptor, { id: "order-insurance" })
const code = transpileModule(script.content, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText

function setup(): Page {
  const exports: Record<string, unknown> = {}
  runInNewContext(code, { exports, Error, uni: { navigateTo }, require: (name: string) => {
    if (name === "vue") return vue
    if (name === "@dcloudio/uni-app") return {
      onLoad: (callback: typeof loaded) => { loaded = callback }, onShow: (callback: typeof show) => { show = callback },
      onHide: (callback: () => void) => { hide = callback }, onUnload: (callback: () => void) => { unload = callback },
    }
    if (name.endsWith("insurance-api")) return { createInsuranceApi: () => ({ getInsurance }) }
    if (name.endsWith("wechat-token")) return { getWechatSessionToken: () => token, getEnrollmentDraftOwner: () => owner }
    if (name.endsWith("api-error")) return { ApiError }
    if (name.endsWith("DiscoveryState.vue")) return { default: vue.defineComponent({ setup: () => () => null }) }
    return {}
  } })
  const component = exports["default"]
  if (!isComponent(component)) throw new Error("Insurance page missing setup")
  const page = component.setup({}, { expose: () => {} })
  page.orderId.value = "order-1"
  return page
}
function isComponent(value: unknown): value is { setup: (props: object, context: object) => Page } {
  return typeof value === "object" && value !== null && "setup" in value && typeof value.setup === "function"
}
function deferred() {
  let resolve: (value: FamilyInsuranceResponse) => void = () => {}
  let reject: (cause: Error) => void = () => {}
  const promise = new Promise<FamilyInsuranceResponse>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}
async function render(page: Page): Promise<string> {
  const template = compileTemplate({ source: descriptor.template?.content ?? "", filename: "insurance.vue", id: "order-insurance", compilerOptions: { bindingMetadata: script.bindings ?? {}, isCustomElement: tag => ["view", "text", "button"].includes(tag) } })
  const exports: Record<string, unknown> = {}
  runInNewContext(transpileModule(template.code, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText, { exports, require: () => vue })
  const compiledRender = exports["render"]
  if (typeof compiledRender !== "function") throw new Error("Insurance template missing render")
  return renderToString(vue.createSSRApp({ setup: () => page, render: compiledRender }))
}
beforeEach(() => {
  token = "session-a"; owner = "family:a"
  getInsurance.mockReset().mockResolvedValue(familyInsurance); navigateTo.mockReset()
  hide = () => {}; unload = () => {}; show = () => {}; loaded = () => {}
})

describe("family insurance page lifecycle", () => {
  it("loads the query order on every show", async () => {
    const page = setup()
    getInsurance.mockResolvedValueOnce({ ...familyInsurance, orderId: "order/2" })
    loaded({ orderId: "order/2" }); await show()
    expect(getInsurance).toHaveBeenCalledWith("order/2")
    expect(page.state.value).toBe("ready")
  })
  it("keeps an empty response ready and distinguishes a failed retry", async () => {
    const page = setup()
    getInsurance.mockResolvedValueOnce({ ...familyInsurance, currentPlan: null, people: [] })
    await page.load()
    expect(page.state.value).toBe("ready")
    getInsurance.mockRejectedValueOnce(new Error("offline"))
    await page.load()
    expect(page.insurance.value).toBeNull()
    expect(page.state.value).toBe("error")
    expect(page.error.value).toContain("加载失败")
    await page.load()
    expect(page.insurance.value).toEqual(familyInsurance)
  })
  it("does not request insurance without an order or login", async () => {
    const page = setup(); page.orderId.value = ""
    await page.load()
    expect(getInsurance).not.toHaveBeenCalled()
    expect(page.error.value).toContain("订单详情")
    page.orderId.value = "order-1"; token = undefined
    await page.load()
    expect(getInsurance).not.toHaveBeenCalled()
    expect(page.needsLogin.value).toBe(true)
  })
  it.each(["token", "owner"])("discards a delayed result after changing %s", async (identity) => {
    const response = deferred(); getInsurance.mockReturnValueOnce(response.promise)
    const page = setup(); const request = page.load()
    if (identity === "token") token = "session-b"
    else owner = "family:b"
    response.resolve(familyInsurance); await request
    expect(page.insurance.value).toBeNull()
    expect(page.state.value).toBe("error")
  })
  it.each(["hide", "unload"])("clears visible data and invalidates late responses on %s", async (event) => {
    const page = setup(); await page.load(); page.togglePlan("current")
    const response = deferred(); getInsurance.mockReturnValueOnce(response.promise)
    const request = page.load(); (event === "hide" ? hide : unload)()
    response.resolve(familyInsurance); await request
    expect(page.insurance.value).toBeNull()
    expect(page.expandedPlans.value.size).toBe(0)
    expect(page.error.value).toBe("")
  })
  it("clears an already visible policy when hiding and reloads on return", async () => {
    const page = setup(); await page.load(); page.togglePlan("current")
    hide()
    expect(page.insurance.value).toBeNull()
    expect(page.expandedPlans.value.size).toBe(0)
    await show()
    expect(getInsurance).toHaveBeenCalledTimes(2)
    expect(page.insurance.value).toEqual(familyInsurance)
  })
  it("ignores an old failure after a newer order has loaded", async () => {
    const response = deferred(); getInsurance.mockReturnValueOnce(response.promise)
    const page = setup(); const request = page.load()
    page.orderId.value = "order-2"
    getInsurance.mockResolvedValueOnce({ ...familyInsurance, orderId: "order-2" }); await page.load()
    response.reject(new ApiError(500, "old failure")); await request
    expect(page.insurance.value?.orderId).toBe("order-2")
    expect(page.state.value).toBe("ready")
    expect(page.error.value).toBe("")
  })
  it("shows login after the current API request expires its identity", async () => {
    const page = setup()
    getInsurance.mockImplementationOnce(async () => { token = undefined; throw new ApiError(401, "登录状态已失效，请重新登录。") })
    await page.load(); page.login()
    expect(page.insurance.value).toBeNull()
    expect(page.needsLogin.value).toBe(true)
    expect(navigateTo).toHaveBeenCalledWith({ url: "/pages/login/index?returnTo=%2Fpages%2Forders%2Findex" })
  })
})

describe("family insurance presentation", () => {
  it("separates the current proposal from each person's historical plan and real policy dates", async () => {
    const page = setup(); await page.load()
    const html = await render(page)
    for (const text of ["当前拟投保方案", "研学出行保障方案", "办理时的保障方案", "参加人甲", "POLICY-FIXTURE-2", "2026-10-12", "2026-10-13"]) expect(html).toContain(text)
    expect(html).not.toContain("保障已生效")
  })
  it("preserves missing historical plans and policy fields instead of filling from the current plan", async () => {
    const page = setup()
    getInsurance.mockResolvedValueOnce({ ...familyInsurance, people: [{ ...familyInsurance.people[0], records: [{ ...insuranceRecord, planSnapshot: null, policyNumber: null, coverageStart: null, coverageEnd: null }] }] })
    await page.load()
    const html = await render(page)
    expect(html).toContain("办理时的方案未记录")
    expect(html).toContain("保单号：未登记")
    expect(html).toContain("保障开始：未登记")
    expect(html).toContain("保障结束：未登记")
    expect(html.split("研学出行保障方案")).toHaveLength(2)
  })
  it.each([
    ["ready", "待送交"], ["blocked", "待核对"], ["submitted", "办理中"], ["insured", "已登记保单"], ["failed", "办理未完成"], ["cancellation_requested", "退保处理中"],
  ] as const)("renders %s as %s", async (status, label) => {
    const page = setup()
    getInsurance.mockResolvedValueOnce({ ...familyInsurance, people: [{ ...familyInsurance.people[0], records: [{ ...insuranceRecord, status }] }] })
    await page.load()
    expect(await render(page)).toContain(label)
  })
  it("keeps batch change and registration refund separate from insurance cancellation", async () => {
    const page = setup()
    getInsurance.mockResolvedValueOnce({ ...familyInsurance, people: [{ ...familyInsurance.people[0], refundStatus: "refunded", records: [{ ...insuranceRecord, batchStatus: "change_pending" }] }] })
    await page.load()
    const html = await render(page)
    expect(html).toContain("本批次变更核对中")
    expect(html).toContain("报名退款：已登记退款")
    expect(html).toContain("已登记保单")
    expect(html).not.toContain("已退保")
  })
  it("shows missing plans and no records as explicit empty content", async () => {
    const page = setup()
    getInsurance.mockResolvedValueOnce({ ...familyInsurance, currentPlan: null, people: [{ ...familyInsurance.people[0], records: [] }] })
    await page.load()
    const html = await render(page)
    expect(html).toContain("保障方案待发布")
    expect(html).toContain("暂无办理记录")
  })
  it("expands long plan text and keeps separate historical details collapsed", async () => {
    const page = setup()
    const coverageSummary = "保障内容".repeat(100) + "末尾责任"
    getInsurance.mockResolvedValueOnce({ ...familyInsurance, currentPlan: { ...insurancePlan, coverageSummary } })
    await page.load()
    expect(await render(page)).not.toContain("末尾责任")
    page.togglePlan("current")
    expect(await render(page)).toContain("末尾责任")
    page.togglePlan("current")
    expect(await render(page)).not.toContain("末尾责任")
  })
})
