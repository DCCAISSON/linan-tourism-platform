import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createApp, h, nextTick, ref } from "vue"
import InsurancePlanEditor from "@/components/InsurancePlanEditor.vue"
import type { SessionInsurancePlan } from "@/api/insurance.types"

const api = vi.hoisted(() => ({ getSessionInsurancePlan: vi.fn(), saveSessionInsurancePlan: vi.fn() }))
vi.mock("@/api/insurance", () => ({ ...api, readableInsuranceError: (value: unknown) => value instanceof Error ? value.message : "操作失败" }))
const apps: ReturnType<typeof createApp>[] = []
const plan = { insurerName: "保险公司", planName: "研学保障", coverageSummary: "意外保障，按正式条款办理。", notice: "详见正式保单" }

beforeEach(() => {
  api.getSessionInsurancePlan.mockImplementation(async (tourSessionId: string) => ({ tourSessionId, plan: null }))
  api.saveSessionInsurancePlan.mockImplementation(async (tourSessionId: string, value: unknown) => ({ tourSessionId, plan: value }))
})
afterEach(() => {
  apps.splice(0).forEach(app => app.unmount())
  document.body.replaceChildren()
  vi.resetAllMocks()
  vi.restoreAllMocks()
})

async function flush(): Promise<void> { for (let i = 0; i < 8; i++) await nextTick() }
function mount(canWrite = true) {
  const session = ref("session-a")
  const host = document.createElement("div")
  document.body.append(host)
  const app = createApp(() => h(InsurancePlanEditor, { key: session.value, tourSessionId: session.value, canWrite }))
  apps.push(app)
  app.mount(host)
  return { session, host }
}
function fill(): void {
  const controls = document.querySelectorAll("input,textarea")
  const values = ["  保险公司  ", "研学保障", "意外保障，按正式条款办理。", "详见正式保单"]
  controls.forEach((node, index) => {
    if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)) throw new Error("expected input")
    node.value = values[index] ?? ""
    node.dispatchEvent(new Event("input", { bubbles: true }))
  })
}
function submit(): void { document.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })) }
function click(text: string): void {
  const button = [...document.querySelectorAll("button")].find(node => node.textContent?.includes(text))
  if (!button) throw new Error(`missing ${text}`)
  button.click()
}

describe("trip insurance plan editor", () => {
  it("saves only this trip's trimmed plan and shows the actual saved result", async () => {
    mount(); await flush()
    expect(document.body.textContent).toContain("尚未配置方案")
    fill(); submit(); await flush()
    expect(api.saveSessionInsurancePlan).toHaveBeenCalledWith("session-a", plan)
    expect(document.body.textContent).toContain("方案已保存，家长可查看")
    expect(document.querySelector("input")?.value).toBe("保险公司")
  })

  it("shows a read failure rather than an empty plan and supports retry", async () => {
    api.getSessionInsurancePlan.mockRejectedValueOnce(new Error("读取失败"))
    mount(); await flush()
    expect(document.body.textContent).toContain("读取失败")
    expect(document.body.textContent).not.toContain("尚未配置方案")
    expect(document.querySelector("form")).toBeNull()
    click("重新读取"); await flush()
    expect(document.body.textContent).toContain("尚未配置方案")
  })

  it("retains typed content on save failure and prevents duplicate submit", async () => {
    let reject: (reason: Error) => void = () => { throw new Error("not pending") }
    api.saveSessionInsurancePlan.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
    mount(); await flush(); fill(); submit(); submit(); await flush()
    expect(api.saveSessionInsurancePlan).toHaveBeenCalledTimes(1)
    reject(new Error("保存失败")); await flush()
    expect(document.body.textContent).toContain("保存失败")
    expect(document.querySelector("textarea")?.value).toBe(plan.coverageSummary)
    submit(); await flush()
    expect(document.body.textContent).toContain("方案已保存")
  })

  it("does not allow read-only accounts to save", async () => {
    mount(false); await flush(); submit(); await flush()
    expect(document.querySelector("fieldset")?.disabled).toBe(true)
    expect(api.saveSessionInsurancePlan).not.toHaveBeenCalled()
  })

  it("ignores a previous trip's late read after the keyed editor switches", async () => {
    let resolve: (value: SessionInsurancePlan) => void = () => { throw new Error("not pending") }
    api.getSessionInsurancePlan.mockImplementationOnce(() => new Promise<SessionInsurancePlan>(done => { resolve = done }))
    const { session } = mount(); session.value = "session-b"; await flush()
    resolve({ tourSessionId: "session-a", plan }); await flush()
    expect(document.querySelector("input")?.value).toBe("")
    expect(document.body.textContent).toContain("尚未配置方案")
  })

  it("ignores the previous trip's late save without changing the new trip", async () => {
    let resolve: (value: SessionInsurancePlan) => void = () => { throw new Error("not pending") }
    api.saveSessionInsurancePlan.mockImplementationOnce(() => new Promise<SessionInsurancePlan>(done => { resolve = done }))
    const { session } = mount(); await flush(); fill(); submit(); await flush()
    session.value = "session-b"; await flush()
    resolve({ tourSessionId: "session-a", plan }); await flush()
    expect(document.querySelector("input")?.value).toBe("")
    expect(document.body.textContent).not.toContain("方案已保存")
  })

  it("clears only after confirmation and states that batch history is retained", async () => {
    api.getSessionInsurancePlan.mockResolvedValue({ tourSessionId: "session-a", plan })
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true)
    mount(); await flush(); click("清除当前方案"); await flush()
    expect(api.saveSessionInsurancePlan).not.toHaveBeenCalled()
    click("清除当前方案"); await flush()
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(api.saveSessionInsurancePlan).toHaveBeenCalledWith("session-a", null)
    expect(document.body.textContent).toContain("已有批次和保单记录保持不变")
  })
})
