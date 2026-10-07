import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createApp, h, nextTick } from "vue"
import CatalogPanel from "../src/views/configuration/CatalogPanel.vue"
import CatalogTemplatePanel from "../src/views/configuration/CatalogTemplatePanel.vue"
import { parseCatalogItem } from "../src/api/configuration.parsers"

const apps: ReturnType<typeof createApp>[] = []
const path = "/catalog-covers/12345678-1234-4123-8123-123456789012.png"
const school = { id: "school", code: "school", name: "临安小学" }
const first = parseCatalogItem({ id: "first", organizationId: "school", title: "山野研学", status: "active", coverImageUrl: "https://images.example/first.jpg" })
const second = { ...first, id: "second", title: "湿地研学", coverImageUrl: "https://images.example/second.jpg" }
beforeEach(() => vi.stubEnv("VITE_API_BASE_URL", "https://admin.example/api"))
afterEach(() => { apps.splice(0).forEach(app => app.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

function mount(render: () => ReturnType<typeof h>) {
  const host = document.createElement("div")
  document.body.append(host)
  const app = createApp(render)
  apps.push(app); app.mount(host)
  return host
}

async function fill(id: string, value: string) {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) throw new Error(`Missing ${id}`)
  element.value = value
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }))
  await nextTick()
}

async function selectFile(id: string) {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLInputElement)) throw new Error(`Missing ${id}`)
  Object.defineProperty(element, "files", { configurable: true, value: { item: () => new File(["image"], "cover.png", { type: "image/png" }) } })
  element.dispatchEvent(new Event("change", { bubbles: true }))
  await nextTick()
}

async function settle() { await new Promise(resolve => setTimeout(resolve, 0)); await nextTick() }
function deferredResponse() {
  const pending = { resolve: (_response: Response): void => { throw new Error("Request not started") } }
  const response = new Promise<Response>(resolve => { pending.resolve = resolve })
  return { response, pending }
}

describe("catalog cover fields", () => {
  it("fills a cover URL after upload without saving the course and blocks save while uploading", async () => {
    // Given
    const { response, pending } = deferredResponse()
    vi.stubGlobal("fetch", vi.fn(() => response))
    const update = vi.fn()
    const host = mount(() => h(CatalogPanel, { catalogItems: [first], schools: [school], error: "", formError: "", loading: false, submitting: false, onUpdate: update }))
    await fill("catalog-edit", "first")
    // When
    await selectFile("catalog-edit-cover-file")
    const save = Array.from(host.querySelectorAll("button")).find(button => button.textContent === "保存课程内容")
    expect(save?.disabled).toBe(true)
    pending.resolve(new Response(JSON.stringify({ path }), { status: 201 }))
    await settle()
    // Then
    expect(document.getElementById("catalog-edit-cover")).toHaveProperty("value", `https://admin.example/api${path}`)
    expect(host.querySelector(`img[src="https://admin.example/api${path}"]`)).not.toBeNull()
    expect(host.textContent).toContain("保存课程后生效")
    expect(save?.disabled).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })

  it("retains the old URL and offers retry when upload fails", async () => {
    // Given
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })))
    const host = mount(() => h(CatalogPanel, { catalogItems: [first], schools: [school], error: "", formError: "", loading: false, submitting: false }))
    await fill("catalog-edit", "first")
    // When
    await selectFile("catalog-edit-cover-file")
    await settle()
    // Then
    expect(document.getElementById("catalog-edit-cover")).toHaveProperty("value", first.coverImageUrl)
    expect(document.getElementById("catalog-edit-cover-file")).toHaveProperty("disabled", false)
    expect(host.textContent).toContain("封面上传暂不可用")
  })

  it("drops an upload response after switching courses", async () => {
    // Given
    const { response, pending } = deferredResponse()
    vi.stubGlobal("fetch", vi.fn(() => response))
    mount(() => h(CatalogPanel, { catalogItems: [first, second], schools: [school], error: "", formError: "", loading: false, submitting: false }))
    await fill("catalog-edit", "first")
    await selectFile("catalog-edit-cover-file")
    // When
    await fill("catalog-edit", "second")
    pending.resolve(new Response(JSON.stringify({ path }), { status: 201 }))
    await settle()
    // Then
    expect(document.getElementById("catalog-edit-cover")).toHaveProperty("value", second.coverImageUrl)
    expect(document.getElementById("catalog-edit-cover-file")).toHaveProperty("disabled", false)
  })

  it("keeps template inherited content disabled", async () => {
    // Given
    const request = vi.fn()
    vi.stubGlobal("fetch", request)
    mount(() => h(CatalogPanel, { catalogItems: [{ ...first, templateId: "template" }], schools: [school], error: "", formError: "", loading: false, submitting: false }))
    // When
    await fill("catalog-edit", "first")
    // Then
    expect(document.getElementById("catalog-edit-cover-file")).toHaveProperty("disabled", true)
    expect(document.getElementById("catalog-edit-cover")).toHaveProperty("disabled", true)
    expect(request).not.toHaveBeenCalled()
  })

  it("drops an upload response after switching shared templates", async () => {
    // Given
    const { response, pending } = deferredResponse()
    const templates = [{ id: "t1", title: "山野", description: "介绍一", coverImageUrl: first.coverImageUrl, version: 1 }, { id: "t2", title: "湿地", description: "介绍二", coverImageUrl: second.coverImageUrl, version: 2 }]
    vi.stubGlobal("fetch", vi.fn((url: string) => url.endsWith("/catalog-templates") ? Promise.resolve(new Response(JSON.stringify(templates))) : response))
    mount(() => h(CatalogTemplatePanel, { catalogItems: [], schools: [school] }))
    await settle()
    await fill("catalog-template-select", "t1")
    await selectFile("catalog-template-cover-file")
    // When
    await fill("catalog-template-select", "t2")
    pending.resolve(new Response(JSON.stringify({ path }), { status: 201 }))
    await settle()
    // Then
    expect(document.getElementById("catalog-template-cover")).toHaveProperty("value", second.coverImageUrl)
    expect(document.getElementById("catalog-template-name")).toHaveProperty("value", "湿地")
  })
})
