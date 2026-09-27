import { createApp, nextTick } from "vue"
import { afterEach, describe, expect, it, vi } from "vitest"
import ExecutionManagementView from "@/views/ExecutionManagementView.vue"
import { managementSession } from "./execution.fixtures"

const apps: ReturnType<typeof createApp>[] = []
const guideAssignment = { id: "assignment-1", staffAccountId: "guide-1", displayName: "导游甲", tourSessionId: "session-1", vehicleId: "vehicle-1", active: true, version: 1, reason: "随车执行", updatedAt: "2026-10-01T00:00:00Z" }

async function mountManagement(permissions = ["execution.read", "execution.manage", "execution.publish"], existingAssignment = false) {
  let assignments = existingAssignment ? [guideAssignment] : []
  let approved = false
  const request = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith("/staff/auth/me")) return Response.json({ actorId: "operator", kind: "staff", forcePasswordChange: false, permissionKeys: permissions, scopes: [] })
    if (url.endsWith("/nodes")) return Response.json({ nodes: [], records: [], counts: null })
    if (url.endsWith("/daily-1/history")) return Response.json([{ ...managementSession.personDailyReports[0], id: "revision-1", reportId: "daily-1", tourSessionId: "session-1", recordedBy: "guide-1", createdAt: "2026-10-01T09:00:00Z", correctionReason: "补充午餐事实", breakfast: "recorded", breakfastNote: "早餐已完成", lunch: "recorded", lunchNote: "午餐正常", dinner: "not_applicable", dinnerNote: "当晚返程", bodyStatus: "私密身体正文", note: "私密备注" }])
    if (url.endsWith("/assignment-candidates")) return Response.json([{ staffAccountId: "guide-1", displayName: "导游甲" }])
    if (url.endsWith("/assignments") && init?.method === "POST") { assignments = [guideAssignment]; return Response.json(guideAssignment) }
    if (url.endsWith("/assignments")) return Response.json(assignments)
    if (url.endsWith("/revoke")) { assignments = [{ ...guideAssignment, active: false, version: 2 }]; return Response.json(assignments[0]) }
    if (url.endsWith("/public-summary")) {
      approved = true
      return Response.json({ ...managementSession.personDailyReports[0], tourSessionId: "session-1", bodyStatus: "", note: "", healthReadable: false, publicApproved: true, publicSummary: "用餐住宿正常", version: 3 })
    }
    if (url.endsWith("/management/sessions")) return Response.json([managementSession])
    if (url.endsWith("/management/sessions/session-1")) return Response.json({ ...managementSession, personDailyReports: managementSession.personDailyReports.map(report => ({ ...report, bodyStatus: "私密身体正文", note: "私密备注", publicApproved: approved, version: approved ? 3 : 2, publicSummary: approved ? "用餐住宿正常" : "" })) })
    return Response.json({ message: "Unexpected request" }, { status: 404 })
  })
  vi.stubGlobal("fetch", request)
  const host = document.createElement("div")
  document.body.append(host)
  const app = createApp(ExecutionManagementView)
  app.mount(host)
  apps.push(app)
  await vi.waitFor(() => expect(request).toHaveBeenCalled())
  return request
}
function button(text: string): HTMLButtonElement {
  const result = [...document.querySelectorAll("button")].find(item => item.textContent?.trim() === text)
  if (!(result instanceof HTMLButtonElement)) throw new Error(`Missing button: ${text}`)
  return result
}
async function fill(labelText: string, value: string): Promise<void> {
  const label = [...document.querySelectorAll("label")].find(item => item.textContent?.startsWith(labelText))
  const control = label?.querySelector("select, input, textarea")
  if (!(control instanceof HTMLSelectElement || control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) throw new Error(`Missing control: ${labelText}`)
  control.value = value
  control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }))
  await nextTick()
}
async function selectSession(): Promise<void> {
  await vi.waitFor(() => expect(document.querySelector("select option[value='session-1']")).not.toBeNull())
  await fill("执行团期", "session-1")
  button("读取执行记录").click()
  await vi.waitFor(() => expect(document.body.textContent).toContain("入住完成"))
}

describe("execution management workflow", () => {
  afterEach(() => { apps.splice(0).forEach(app => app.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals() })

  it("opens a scoped session without guide assignment and omits private detail", async () => {
    const request = await mountManagement()
    await selectSession()
    expect(document.body.textContent).toContain("当前点名")
    expect(document.body.textContent).not.toContain("私密身体正文")
    expect(document.body.textContent).not.toContain("私密备注")
    expect(request.mock.calls.some(([url]) => String(url).endsWith("/staff/execution/sessions/session-1"))).toBe(false)
  })

  it("assigns by eligible display name and selected vehicle", async () => {
    const request = await mountManagement()
    await selectSession()
    await vi.waitFor(() => expect(document.querySelector("option[value='guide-1']")?.textContent).toBe("导游甲"))
    await fill("指派导游", "guide-1")
    await fill("负责车辆", "vehicle-1")
    await fill("指派说明", "随车执行")
    button("保存导游指派").click()
    await vi.waitFor(() => expect(document.body.textContent).toContain("导游指派已保存。"))
    const call = request.mock.calls.find(([url, init]) => String(url).endsWith("/assignments") && init?.method === "POST")
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ staffAccountId: "guide-1", vehicleId: "vehicle-1", reason: "随车执行" })
  })

  it("revokes the selected assignment with a reason", async () => {
    const request = await mountManagement(undefined, true)
    await selectSession()
    await vi.waitFor(() => expect(document.body.textContent).toContain("指派有效"))
    await fill("撤销原因", "工作调整")
    button("撤销指派").click()
    await vi.waitFor(() => expect(document.body.textContent).toContain("导游指派已撤销。"))
    const call = request.mock.calls.find(([url]) => String(url).endsWith("/assignments/assignment-1/revoke"))
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ reason: "工作调整" })
  })

  it("approves a personal summary using the version displayed to the reviewer", async () => {
    const request = await mountManagement()
    await selectSession()
    await fill("公开摘要", "用餐住宿正常")
    button("批准公开摘要").click()
    await vi.waitFor(() => expect(document.body.textContent).toContain("个人公开摘要已批准。"))
    const call = request.mock.calls.find(([url]) => String(url).endsWith("/person-daily-reports/daily-1/public-summary"))
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ publicSummary: "用餐住宿正常", expectedVersion: 2 })
  })

  it("does not request management data when the staff only has execution read permission", async () => {
    const request = await mountManagement(["execution.read"])
    await vi.waitFor(() => expect(document.body.textContent).toContain("无权查看执行管理"))
    expect(request.mock.calls.some(([url]) => String(url).includes("/management/"))).toBe(false)
  })
  it("shows meal revision facts and reasons without private health detail", async () => {
    await mountManagement()
    await selectSession()
    button("查看 学生甲 的日报历史").click()
    await vi.waitFor(() => expect(document.body.textContent).toContain("补充午餐事实"))
    expect(document.body.textContent).toContain("早餐已完成")
    expect(document.body.textContent).toContain("当晚返程")
    expect(document.body.textContent).not.toContain("私密身体正文")
    expect(document.body.textContent).not.toContain("私密备注")
  })
})
