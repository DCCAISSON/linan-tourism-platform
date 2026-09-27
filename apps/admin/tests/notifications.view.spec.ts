import { createApp, nextTick } from "vue"
import { afterEach, describe, expect, it, vi } from "vitest"
import NotificationsView from "@/views/NotificationsView.vue"

const session = {
  canWrite: true, canSend: true, wechatConfigured: false,
  contents: [{ id: "content-1", title: "集合提醒", bodyText: "请准时到达", templateId: "template-1", templateData: { thing3: { value: "学校南门" } }, miniappPage: null, createdAt: "2026-09-23T00:00:00.000Z" }],
  entries: [],
  tasks: [{ id: "task-1", contentVersionId: "content-1", status: "manual_required", createdAt: "2026-09-23T00:00:00.000Z" }],
}
const task = {
  id: "task-1", tourSessionId: "session-1", contentVersionId: "content-1", status: "manual_required", createdAt: "2026-09-23T00:00:00.000Z",
  targets: [{ id: "target-1", authorizationId: "authorization-1", orderId: "order-1", receiverName: "林女士", relation: "guardian", channel: "wechat_subscribe", status: "retryable_failed" }],
  attempts: [],
}

describe("notification admin page policies", () => {
  afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren() })

  it("clears loaded data when the selected session changes", async () => {
    stubResponses()
    const app = mountPage()
    await loadSession("session-1")
    expect(document.body.textContent).toContain("集合提醒")

    setValue(controlByLabel("团期"), "session-2")
    await nextTick()

    expect(document.body.textContent).not.toContain("集合提醒")
    expect(document.body.textContent).toContain("请选择团期读取配置")
    app.unmount()
  })

  it("prefills a business source, filters recipients and sends source identity only when creating a task", async () => {
    stubResponses()
    const originalFetch = globalThis.fetch
    const requests: { readonly url: string; readonly body: unknown }[] = []
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (init?.method === "POST") requests.push({ url, body: JSON.parse(String(init.body)) })
      if (url.endsWith("/preview")) return Response.json(task.targets)
      if (url.endsWith("/tasks")) return Response.json(task)
      if (url.endsWith("/recipients")) return Response.json([
        { ...task.targets[0], receiverName: "林女士" },
        { ...task.targets[0], authorizationId: "other", orderId: "other-order", receiverName: "其他订单家长" },
      ])
      if (url.endsWith("/sessions/session-1")) return Response.json({ ...session, sources: [{ id: "source-1", kind: "order_created", orderId: "order-1", sourceVersion: 1, title: "报名订单已创建", bodyText: "请核对订单", createdAt: "2026-09-28", linkedTaskId: null, status: "pending", authorizationIds: ["authorization-1"] }] })
      return originalFetch(input, init)
    }))
    const app = mountPage()
    await loadSession("session-1")
    buttonByText("填写通知并处理").click()
    await nextTick()
    expect(controlByLabel("标题").value).toBe("报名订单已创建")
    expect(controlByLabel("正文").value).toBe("请核对订单")
    expect(document.body.textContent).not.toContain("其他订单家长")
    controlByLabel("林女士").click()
    await nextTick()
    buttonByText("预览接收人").click()
    await vi.waitFor(() => expect(document.body.textContent).toContain("已预览 1 名"))
    setValue(controlByLabel("内容版本"), "content-1")
    await nextTick()
    buttonByText("创建任务").click()
    await vi.waitFor(() => expect(document.body.textContent).toContain("通知任务已创建，尚未发送"))
    expect(requests.find(row => row.url.endsWith("/tasks"))?.body).toMatchObject({ sourceId: "source-1", authorizationIds: ["authorization-1"] })
    expect(requests.some(row => /\/(send|retry)$/.test(row.url))).toBe(false)
    app.unmount()
  })

  it("enables retry from target state and shows the attempt target policy", async () => {
    stubResponses()
    const app = mountPage()
    await loadSession("session-1")
    buttonByText("task-1").click()
    await vi.waitFor(() => expect(document.body.textContent).toContain("任务 task-1"))

    expect(buttonByText("明确重试失败目标").disabled).toBe(false)
    app.unmount()
  })

  it("shows persisted fields and rejects invalid field names without JSON editing", async () => {
    stubResponses()
    const app = mountPage()
    await loadSession("session-1")
    expect(document.body.textContent).toContain("学校南门")
    expect(document.body.textContent).not.toContain("模板数据 JSON")
    buttonByText("添加模板字段").click()
    await nextTick()
    setValue(controlByLabel("微信模板字段名"), "bad key")
    setValue(controlByLabel("字段值"), "集合地点")
    const form = buttonByText("创建内容版本").closest("form")
    if (!(form instanceof HTMLFormElement)) throw new Error("content form missing")
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(document.body.textContent).toContain("模板字段名不正确或重复"))
    app.unmount()
  })

  it("hides mutations when a reader has no write or send permission", async () => {
    stubResponses(false)
    const app = mountPage()
    await loadSession("session-1")
    expect(document.body.textContent).not.toContain("创建内容版本")
    buttonByText("task-1").click()
    await vi.waitFor(() => expect(document.body.textContent).toContain("任务 task-1"))
    expect(document.body.textContent).not.toContain("发送待处理目标")
    app.unmount()
  })

  it("reuses an internal task key after a failed response and never dispatches during creation", async () => {
    stubResponses()
    const originalFetch = globalThis.fetch
    const keys: unknown[] = []
    const requests: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push(url)
      if (url.endsWith("/preview")) return Response.json(task.targets)
      if (url.endsWith("/tasks") && init?.method === "POST") {
        const body: unknown = JSON.parse(String(init.body))
        if (typeof body !== "object" || body === null) throw new Error("Invalid task request")
        keys.push(Object.fromEntries(Object.entries(body))["idempotencyKey"])
        if (keys.length === 1) throw new Error("暂时未收到任务结果")
        return Response.json(task)
      }
      return originalFetch(input, init)
    }))
    const app = mountPage()
    await loadSession("session-1")
    const checkbox = controlByLabel("林女士")
    checkbox.click()
    await nextTick()
    buttonByText("预览接收人").click()
    await vi.waitFor(() => expect(document.body.textContent).toContain("已预览 1 名"))
    setValue(controlByLabel("内容版本"), "content-1")
    await nextTick()
    buttonByText("创建任务").click()
    await vi.waitFor(() => expect(document.body.textContent).toContain("暂时未收到任务结果"))
    buttonByText("创建任务").click()
    await vi.waitFor(() => expect(document.body.textContent).toContain("通知任务已创建，尚未发送"))
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
    expect(requests.some(url => /\/(send|retry)$/.test(url))).toBe(false)
    expect(document.body.textContent).not.toContain("幂等键")
    app.unmount()
  })
})

function stubResponses(canMutate = true): void {
  vi.stubGlobal("fetch", vi.fn(async input => {
    const url = String(input)
    if (url.endsWith("/sessions")) return Response.json([{ id: "session-1", label: "秋季研学" }, { id: "session-2", label: "冬季研学" }])
    if (url.endsWith("/recipients")) return Response.json([{ authorizationId: "authorization-1", orderId: "order-1", receiverName: "林女士", relation: "guardian", channel: "manual" }])
    return Response.json(url.endsWith("/tasks/task-1") ? task : { ...session, canWrite: canMutate, canSend: canMutate })
  }))
}

function mountPage() {
  const root = document.createElement("div")
  document.body.append(root)
  const app = createApp(NotificationsView)
  app.mount(root)
  return app
}

async function loadSession(sessionId: string): Promise<void> {
  await vi.waitFor(() => expect(document.body.textContent).toContain("秋季研学"))
  setValue(controlByLabel("团期"), sessionId)
  await nextTick()
  buttonByText("读取团期通知").click()
  await vi.waitFor(() => expect(document.body.textContent).toContain("团期通知已读取。"))
}

function controlByLabel(text: string): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  const label = [...document.querySelectorAll("label")].find(item => item.textContent?.includes(text) === true)
  const control = label?.querySelector("input, textarea, select")
  if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) return control
  throw new Error(`control missing: ${text}`)
}

function buttonByText(text: string): HTMLButtonElement {
  const button = [...document.querySelectorAll("button")].find(item => item.textContent?.includes(text) === true)
  if (button instanceof HTMLButtonElement) return button
  throw new Error(`button missing: ${text}`)
}

function setValue(control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  control.value = value
  control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }))
}
