import { afterEach, describe, expect, it, vi } from "vitest"
import { createApp, h, nextTick } from "vue"
import SessionPanel from "../src/views/configuration/SessionPanel.vue"
import { parseTourSession } from "../src/api/configuration.parsers"

vi.mock("../src/views/configuration/SessionCreateForm.vue", () => ({ default: { render: () => null } }))
vi.mock("../src/views/configuration/SessionEditForm.vue", () => ({ default: { render: () => null } }))
const apps: ReturnType<typeof createApp>[] = []
afterEach(() => { apps.splice(0).forEach(app => app.unmount()); document.body.replaceChildren() })

function mountPanel() {
  const createNotice = vi.fn()
  const activateNotice = vi.fn()
  const host = document.createElement("div")
  document.body.append(host)
  const app = createApp(() => h(SessionPanel, {
    catalogItems: [{ id: "catalog", organizationId: "school", code: "course", title: "山野研学", status: "published", policyVersion: "v1", description: "认识本地植物", coverImageUrl: "" }],
    tourSessions: [parseTourSession({ id: "first", catalogItemId: "catalog", priceFen: 12800, code: "A" }), parseTourSession({ id: "second", catalogItemId: "catalog", priceFen: 16800, code: "B" })],
    schools: [], noticeVersions: [], error: "", formError: "", loading: false, submitting: false,
    onCreateNotice: createNotice, onActivateNotice: activateNotice,
  }))
  apps.push(app); app.mount(host)
  return { createNotice, activateNotice }
}

async function fill(id: string, value: string) {
  const input = document.getElementById(id)
  if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement || input instanceof HTMLTextAreaElement)) throw new Error(`Missing ${id}`)
  input.value = value
  input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }))
  await nextTick()
}

describe("parent notice preview", () => {
  it("updates saved session price and editable notice content without changing calculation", async () => {
    mountPanel()
    expect(document.querySelector(".notice-preview")).toBeNull()
    await fill("notice-session", "first")
    await fill("notice-destination", "天目山")
    await fill("notice-prices", "包含车费与午餐")
    expect(document.querySelector(".notice-preview")?.textContent).toContain("128.00")
    expect(document.querySelector(".notice-preview")?.textContent).toContain("天目山")
    expect(document.querySelector(".notice-preview")?.textContent).toContain("包含车费与午餐")
    await fill("notice-session", "second")
    expect(document.querySelector(".notice-preview")?.textContent).toContain("168.00")
    expect(document.querySelector(".notice-preview")?.textContent).not.toContain("128.00")
  })
  it("creates the exact entered content without silently activating it", async () => {
    const state = mountPanel()
    await fill("notice-session", "first")
    await fill("notice-reminders", " 自备水杯 \n 穿运动鞋 ")
    document.querySelector(".configuration-form--notice")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    expect(state.createNotice).toHaveBeenCalledWith(expect.objectContaining({ tourSessionId: "first", payload: expect.objectContaining({ contentJson: expect.objectContaining({ reminders: ["自备水杯", "穿运动鞋"] }) }) }))
    expect(state.activateNotice).not.toHaveBeenCalled()
  })
})
