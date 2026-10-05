import { createApp, h, nextTick } from "vue"
import { createMemoryHistory, createRouter, RouterView } from "vue-router"
import { afterEach, describe, expect, it, vi } from "vitest"
import EvaluationsView from "@/views/EvaluationsView.vue"
import EvaluationStandardsView from "@/views/EvaluationStandardsView.vue"

const permissions = ["evaluations.read", "evaluations.write", "evaluations.confirm", "evaluations.standard.write", "evaluations.standard.confirm"]
const standard = { id: "std", tourSessionId: "session", title: "标准", version: 2, confirmedAt: "2026-09-27", items: [{ code: "A", label: "优秀", description: "人工判断" }, { code: "B", label: "合格", description: "人工判断" }], dimensions: [] }
const students = [{ personRef: "paid:a", displayName: "学生甲", gradeName: null, className: null }, { personRef: "paid:b", displayName: "学生乙", gradeName: null, className: null }]

describe("individual manual evaluations", () => {
  afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren() })

  it("leaves both students ungraded until each is manually selected and saves one person only", async () => {
    const saved: unknown[] = []
    vi.stubGlobal("fetch", vi.fn(async (input, init?: RequestInit) => {
      const path = String(input)
      if (path.includes("/staff/auth/")) return Response.json({ actorId: "staff", displayName: "导游", kind: "administrator", forcePasswordChange: false, permissionKeys: permissions, scopes: [{ kind: "all", id: null }] })
      if (path.endsWith("/evaluations/sessions")) return Response.json([{ id: "session", code: "第一团", title: "山水研学", organizationId: "school" }])
      if (path.endsWith("/batch")) { saved.push(JSON.parse(String(init?.body))); return Response.json([]) }
      return Response.json({ organizationId: "school", standards: [standard], students, evaluations: [] })
    }))
    const app = await mount(EvaluationsView)
    await load("加载评价")
    expect(document.body.textContent).toContain("应评 2 人 · 已评 0 人 · 未评 2 人")
    expect(document.querySelector('[aria-label="选择全部学生"]')).toBeNull()
    button("评价学生甲").click()
    await nextTick()
    setValue(control("评价标准"), "std")
    await nextTick()
    expect(control("等级").value).toBe("未评级")
    setValue(control("等级"), "A")
    button("保存当前学生评价").click()
    await vi.waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0]).toMatchObject({ observations: [{ personRef: "paid:a", gradeCode: "A" }] })
    await vi.waitFor(() => expect(document.body.textContent).toContain("评价已保存"))
    button("评价学生乙").click()
    await nextTick()
    expect(control("等级").value).toBe("未评级")
    app.unmount()
  })

  it("loads a school report by its authorized session name without asking for internal IDs", async () => {
    // Given a school account and a single authorized named session.
    const requests: string[] = []
    vi.stubGlobal("fetch", vi.fn(async input => {
      const path = String(input)
      requests.push(path)
      if (path.includes("/staff/auth/")) return Response.json({ actorId: "school", kind: "school", forcePasswordChange: false, permissionKeys: ["evaluations.school_report"], scopes: [{ kind: "school", id: "school-a" }] })
      if (path.endsWith("/evaluations/sessions")) return Response.json([{ id: "private-session-id", code: "第一团", title: "本校山水研学", organizationId: "school-a" }])
      return Response.json([{ personRef: "paid:a", displayName: "学生甲", gradeName: "五年级", className: "一班", gradeCode: "A", gradeLabel: "优秀" }])
    }))
    const app = await mount(EvaluationsView)
    await vi.waitFor(() => expect(document.body.textContent).toContain("本校山水研学"))
    // When the school selects the displayed session and loads the report.
    setValue(control("团期"), "private-session-id")
    await nextTick()
    button("加载评价").click()
    // Then the selected session supplies its own organization and no IDs must be entered.
    await vi.waitFor(() => expect(document.body.textContent).toContain("学生甲"))
    expect(requests.some(path => path.endsWith("/evaluations/school/sessions/private-session-id?organizationId=school-a"))).toBe(true)
    expect(document.body.textContent).not.toContain("团期 ID")
    expect(document.body.textContent).not.toContain("学校 ID")
    expect(requests.some(path => path.includes("/evaluations/staff/"))).toBe(false)
    app.unmount()
  })

  it("loads seven editable suggestions only after the explicit action and does not save automatically", async () => {
    const calls: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (input) => {
      calls.push(String(input))
      return Response.json(String(input).includes("/staff/auth/") ? { actorId: "staff", displayName: "工作人员", kind: "administrator", forcePasswordChange: false, permissionKeys: permissions, scopes: [{ kind: "all", id: null }] } : [])
    }))
    const app = await mount(EvaluationStandardsView)
    await load("加载标准")
    expect(control("A 等级说明").value).toBe("优秀")
    expect(control("B 等级说明").value).toBe("合格")
    expect(control("A 等级说明").hasAttribute("readonly")).toBe(true)
    expect(control("B 等级说明").hasAttribute("readonly")).toBe(true)
    expect(document.body.textContent).not.toContain("项目 1 名称")
    button("使用研学观察建议").click()
    await nextTick()
    expect(control("项目 7 名称").value).toBe("表达与分享收获")
    setValue(control("项目 1 名称"), "本次课程安全要求")
    await nextTick()
    expect(control("项目 1 名称").value).toBe("本次课程安全要求")
    expect(calls.filter((path) => path.endsWith("/evaluations/staff/standards"))).toHaveLength(0)
    app.unmount()
  })
})

async function mount(component: typeof EvaluationsView | typeof EvaluationStandardsView) {
  const host = document.createElement("div")
  document.body.append(host)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/evaluations", component }] })
  await router.push("/evaluations")
  const app = createApp({ render: () => h(RouterView) }).use(router)
  app.mount(host)
  return app
}
function button(text: string): HTMLButtonElement {
  const element = [...document.querySelectorAll("button")].find((item) => item.textContent?.trim() === text)
  if (!(element instanceof HTMLButtonElement)) throw new Error(`Missing button ${text}`)
  return element
}
function control(text: string): HTMLInputElement | HTMLSelectElement {
  const label = [...document.querySelectorAll("label")].find((item) => item.firstChild?.textContent?.trim() === text)
  const element = label?.querySelector("input, select")
  if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) throw new Error(`Missing control ${text}`)
  return element
}
function setValue(element: HTMLInputElement | HTMLSelectElement, value: string): void {
  element.value = value
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }))
}
async function load(action: string): Promise<void> {
  if (action === "加载评价") await vi.waitFor(() => expect(document.body.textContent).toContain("山水研学"))
  setValue(control(action === "加载标准" ? "团期 ID" : "团期"), "session")
  await nextTick()
  button(action).click()
  await vi.waitFor(() => expect(document.body.textContent).toContain(action === "加载标准" ? "保存标准草稿" : "学生甲"))
}
