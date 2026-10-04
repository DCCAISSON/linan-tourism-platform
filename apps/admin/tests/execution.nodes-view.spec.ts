import { createApp, nextTick } from "vue"
import { afterEach, describe, expect, it, vi } from "vitest"
import ExecutionNodesPanel from "@/views/ExecutionNodesPanel.vue"

const apps: ReturnType<typeof createApp>[] = []
const node = { id: "node-1", reportDate: "2026-10-01", type: "attendance", label: "出发", scheduledTime: null, active: true, version: 2 }
const original = { id: "record-1", rootId: "record-1", nodeId: "node-1", personRef: "paid:person-1", reportDate: "2026-10-01", type: "attendance", label: "出发", occurredAt: "2026-10-01T00:00:00Z", status: "absent", location: "校门", note: "", correctsId: null, correctionReason: "", version: 1, recordedBy: "guide-1", createdAt: "2026-10-01T00:01:00Z" }
async function mount(manageable: boolean, history = false, multipleDays = false) {
  const request = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).endsWith("/staff/auth/me")) return Response.json({ actorId: "guide-1", kind: "staff", forcePasswordChange: false, permissionKeys: ["execution.read", "execution.write", ...(manageable ? ["execution.manage"] : [])], scopes: [] })
    if (init?.method === "POST") return Response.json(node)
    const nextNode = { ...node, id: "node-2", reportDate: "2026-10-02", label: "第二天集合" }
    const correction = { ...original, id: "record-2", correctsId: original.id, version: 2, status: "present", recordedByName: "导游甲", correctionReason: "现场核对" }
    const nextRecord = { ...original, id: "record-3", rootId: "record-3", nodeId: nextNode.id, reportDate: nextNode.reportDate, label: nextNode.label }
    return Response.json({ nodes: multipleDays ? [node, nextNode] : history ? [node] : [], records: multipleDays ? [original, correction, nextRecord] : history ? [original] : [], counts: history ? { expected: multipleDays ? 4 : 2, completed: multipleDays ? 2 : 1, missing: multipleDays ? 2 : 1 } : null, progress: history ? [{ nodeId: "node-1", expected: 2, completed: 1, missingPeople: ["paid:person-2"], absentPeople: ["paid:person-1"] }, ...(multipleDays ? [{ nodeId: "node-2", expected: 2, completed: 1, missingPeople: ["paid:person-2"], absentPeople: [] }] : [])] : [] })
  })
  vi.stubGlobal("fetch", request)
  const host = document.createElement("div")
  document.body.append(host)
  const app = createApp(ExecutionNodesPanel, { sessionId: "session-1", people: [{ personRef: "paid:person-1", displayName: "学生甲" }, { personRef: "paid:person-2", displayName: "学生乙" }], startsAt: "2026-10-01T00:00:00Z", endsAt: multipleDays ? "2026-10-02T10:00:00Z" : "2026-10-01T10:00:00Z", manageable, editable: !manageable })
  app.mount(host); apps.push(app)
  await vi.waitFor(() => expect(document.body.textContent).toContain("执行节点与发生记录"))
  await vi.waitFor(() => expect(document.body.textContent).not.toContain("正在读取节点"))
  return request
}
function button(text: string): HTMLButtonElement {
  const result = [...document.querySelectorAll("button")].find(item => item.textContent?.trim() === text)
  if (!(result instanceof HTMLButtonElement)) throw new Error(`Missing button: ${text}`)
  return result
}
async function fill(labelText: string, value: string): Promise<void> {
  const control = [...document.querySelectorAll("label")].find(item => item.textContent?.startsWith(labelText))?.querySelector("input, select, textarea")
  if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) throw new Error(`Missing field: ${labelText}`)
  control.value = value
  control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }))
  await nextTick()
}
describe("execution node workflow", () => {
  afterEach(() => { apps.splice(0).forEach(app => app.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals() })
  it("requires explicit plan confirmation and never seeds room checks when a manager opens a day trip", async () => {
    // Given / When: a manager opens an unconfigured day trip.
    const request = await mount(true)
    // Then: only deliberate saving writes a plan; no completion rate is invented.
    expect(document.body.textContent).toContain("尚未配置应填节点")
    expect(request.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false)
    button("出发建议").click(); await nextTick()
    expect(request.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false)
    button("确认保存节点").click()
    await vi.waitFor(() => expect(request.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true))
    const post = request.mock.calls.find(([, init]) => init?.method === "POST")
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ reportDate: "2026-10-01", type: "attendance", label: "出发", expectedVersion: 0, active: true })
  })
  it("keeps the original visible and sends its version and reason when a guide corrects it", async () => {
    // Given: a guide has a saved absence.
    const request = await mount(false, true)
    expect(document.body.textContent).not.toContain("确认保存节点")
    // When: they correct it with a reason.
    button("更正此记录").click(); await nextTick()
    expect(button("保存更正").disabled).toBe(true)
    await fill("记录状态", "present"); await fill("更正原因", "原点名误记，已现场核对")
    button("保存更正").click()
    // Then: the old reference and version travel with the new record.
    await vi.waitFor(() => expect(request.mock.calls.some(([url]) => String(url).endsWith("/occurrences"))).toBe(true))
    const post = request.mock.calls.find(([url]) => String(url).endsWith("/occurrences"))
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ correctsId: "record-1", expectedVersion: 1, correctionReason: "原点名误记，已现场核对", status: "present", nodeId: "node-1", occurredAt: "2026-10-01T00:00:00.000Z" })
    expect(document.body.textContent).toContain("校门")
  })
  it("sends the displayed plan version when a manager changes a saved node", async () => {
    const request = await mount(true, true)
    button("修改节点 出发").click(); await nextTick()
    await fill("节点标签", "校门集合")
    button("确认保存节点").click()
    await vi.waitFor(() => expect(request.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true))
    const post = request.mock.calls.find(([, init]) => init?.method === "POST")
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ id: "node-1", expectedVersion: 2, label: "校门集合" })
  })
  it("identifies missing and absent people for each configured node", async () => {
    await mount(true, true)
    const plans = document.querySelector('[aria-label="已配置节点"]')
    expect(plans?.textContent).toContain("应填 2 · 已填 1 · 未填 1")
    expect(plans?.textContent).toContain("未填：学生乙")
    expect(plans?.textContent).toContain("未到：学生甲")
  })
  it("filters plans, history and completion counts by the selected date", async () => {
    await mount(true, true, true)
    await fill("查看日期", "2026-10-02")
    expect(document.querySelector('[aria-label="已配置节点"]')?.textContent).not.toContain("出发")
    expect(document.querySelector('[aria-label="发生记录历史"]')?.textContent).not.toContain("出发")
    expect(document.querySelector('[aria-label="节点完成统计"]')?.textContent).toBe("应填 2 · 已填 1 · 未填 1")
    await fill("查看日期", "")
    expect(document.querySelector('[aria-label="节点完成统计"]')?.textContent).toBe("应填 4 · 已填 2 · 未填 2")
  })
  it("shows staff names and human-readable correction references without technical identifiers", async () => {
    await mount(true, true, true)
    const history = document.querySelector('[aria-label="发生记录历史"]')?.textContent
    expect(history).toContain("记录人：导游甲")
    expect(history).toContain("记录人：工作人员")
    expect(history).toContain("原记录：2026-10-01 · 出发 · 版本 1")
    expect(history).not.toContain("record-1")
    expect(history).not.toContain("guide-1")
  })
})
