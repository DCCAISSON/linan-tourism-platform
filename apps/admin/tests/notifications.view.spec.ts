import { createApp, nextTick } from "vue"
import { afterEach, describe, expect, it, vi } from "vitest"
import NotificationsView from "@/views/NotificationsView.vue"

const session = {
  contents: [{ id: "content-1", title: "集合提醒", bodyText: "请准时到达", templateId: "template-1", miniappPage: null, createdAt: "2026-09-23T00:00:00.000Z" }],
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

  it("clears loaded data when the editable session id changes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(session)))
    const app = mountPage()
    await loadSession("session-1")
    expect(document.body.textContent).toContain("集合提醒")

    setValue(controlByLabel("团期 ID"), "session-2")
    await nextTick()

    expect(document.body.textContent).not.toContain("集合提醒")
    expect(document.body.textContent).toContain("请输入团期 ID 读取配置")
    app.unmount()
  })

  it("enables retry from target state and shows the attempt target policy", async () => {
    vi.stubGlobal("fetch", vi.fn(async input => Response.json(String(input).endsWith("/tasks/task-1") ? task : session)))
    const app = mountPage()
    await loadSession("session-1")
    buttonByText("task-1").click()
    await vi.waitFor(() => expect(document.body.textContent).toContain("任务 task-1"))

    expect(buttonByText("明确重试失败目标").disabled).toBe(false)
    app.unmount()
  })

  it("shows the specific local template JSON error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(session)))
    const app = mountPage()
    await loadSession("session-1")
    setValue(controlByLabel("模板数据 JSON"), "{")
    const form = buttonByText("创建内容版本").closest("form")
    if (!(form instanceof HTMLFormElement)) throw new Error("content form missing")
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(document.body.textContent).toContain("模板数据不是有效 JSON。"))
    app.unmount()
  })
})

function mountPage() {
  const root = document.createElement("div")
  document.body.append(root)
  const app = createApp(NotificationsView)
  app.mount(root)
  return app
}

async function loadSession(sessionId: string): Promise<void> {
  setValue(controlByLabel("团期 ID"), sessionId)
  await nextTick()
  buttonByText("读取团期通知").click()
  await vi.waitFor(() => expect(document.body.textContent).toContain("团期通知已读取。"))
}

function controlByLabel(text: string): HTMLInputElement | HTMLTextAreaElement {
  const label = [...document.querySelectorAll("label")].find(item => item.textContent?.includes(text) === true)
  const control = label?.querySelector("input, textarea")
  if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) return control
  throw new Error(`control missing: ${text}`)
}

function buttonByText(text: string): HTMLButtonElement {
  const button = [...document.querySelectorAll("button")].find(item => item.textContent?.includes(text) === true)
  if (button instanceof HTMLButtonElement) return button
  throw new Error(`button missing: ${text}`)
}

function setValue(control: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  control.value = value
  control.dispatchEvent(new Event("input", { bubbles: true }))
}
