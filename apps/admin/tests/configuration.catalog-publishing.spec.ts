import { afterEach, describe, expect, it, vi } from "vitest"
import { createApp, h, nextTick } from "vue"
import CatalogPanel from "../src/views/configuration/CatalogPanel.vue"
import SessionPanel from "../src/views/configuration/SessionPanel.vue"
import { parseCatalogItem, parseTourSession } from "../src/api/configuration.parsers"
import { useCatalogSessions } from "../src/views/configuration/useCatalogSessions"

vi.mock("../src/views/configuration/SessionCreateForm.vue", () => ({ default: { render: () => null } }))
vi.mock("../src/views/configuration/SessionEditForm.vue", () => ({ default: { render: () => null } }))
const apps: ReturnType<typeof createApp>[] = []
const catalog = parseCatalogItem({ id: "catalog", organizationId: "school", title: "山野研学", status: "active", description: "已保存的课程介绍", coverImageUrl: "https://images.example/saved.jpg" })
const school = { id: "school", code: "school", name: "临安小学" }
const session = parseTourSession({ id: "session", organizationId: "school", catalogItemId: "catalog", code: "一期", status: "draft", priceFen: 12800, capacity: 30, startsAt: "2026-10-20T00:00:00Z", endsAt: "2026-10-20T08:00:00Z", enrollmentOpensAt: "2026-10-01T00:00:00Z", enrollmentClosesAt: "2026-10-19T00:00:00Z" })
afterEach(() => { apps.splice(0).forEach(app => app.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals() })

function mount(render: () => ReturnType<typeof h>) {
  const host = document.createElement("div")
  document.body.append(host)
  const app = createApp(render)
  apps.push(app); app.mount(host)
  return host
}

describe("catalog publishing feedback", () => {
  it.each([{ catalogItems: [] }, { catalogItems: [catalog] }])("shows a server error once regardless of whether the edit form exists", async ({ catalogItems }) => {
    // Given
    const host = mount(() => h(CatalogPanel, { catalogItems, schools: [school], error: "", formError: "课程已有团期，不能删除", loading: false, submitting: false }))
    // When
    await nextTick()
    // Then
    expect(Array.from(host.querySelectorAll("p")).filter(element => element.textContent === "课程已有团期，不能删除")).toHaveLength(1)
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("课程已有团期，不能删除")
  })

  it("retains the new course validation message alongside the single server error", async () => {
    // Given
    const create = vi.fn()
    const host = mount(() => h(CatalogPanel, { catalogItems: [catalog], schools: [school], error: "", formError: "课程已有团期，不能删除", loading: false, submitting: false, onCreate: create }))
    // When
    host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await nextTick()
    // Then
    expect(host.querySelector("form .form-error")?.textContent).toBe("请选择学校，并填写课程编码和名称")
    expect(Array.from(host.querySelectorAll("p")).filter(element => element.textContent === "课程已有团期，不能删除")).toHaveLength(1)
    expect(create).not.toHaveBeenCalled()
  })

  it("offers local covers and a saved content entry for each existing course", async () => {
    // Given
    const host = mount(() => h(CatalogPanel, { catalogItems: [catalog], schools: [school], error: "", formError: "", loading: false, submitting: false }))
    // When
    await nextTick()
    // Then
    expect(host.querySelectorAll('input[type="file"]').length).toBe(2)
    expect(host.querySelector('label[for="catalog-cover"]')?.textContent).toBe("封面链接")
    expect(host.querySelector('label[for="catalog-edit-cover"]')?.textContent).toBe("修改封面链接")
    expect(host.textContent).toContain("查看已保存内容")
    expect(host.textContent).toContain("保存课程不等于发布团期")
  })

  it("sets saved feedback only after a successful course mutation", async () => {
    // Given
    const state = useCatalogSessions()
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(catalog), { status: 201 })))
    // When
    await state.submitCatalogItem({ organizationId: "school", code: "course", title: "山野研学", status: "active" })
    // Then
    expect(state.catalogSavedId.value).toBe("catalog")
    expect(state.catalogSuccess.value).toContain("已保存")
    expect(state.catalogItems.value).toEqual([catalog])
  })

  it("clears previous success when a later course save fails", async () => {
    // Given
    const state = useCatalogSessions()
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(catalog), { status: 201 })))
    await state.submitCatalogItem({ organizationId: "school", code: "course", title: "山野研学", status: "active" })
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "保存失败" }), { status: 503 })))
    // When
    await state.updateCatalog({ id: "catalog", payload: { description: "未保存", coverImageUrl: "" } })
    // Then
    expect(state.catalogSavedId.value).toBe("")
    expect(state.catalogSuccess.value).toBe("")
    expect(state.catalogFormError.value).toBe("保存失败")
    expect(state.catalogItems.value[0]?.description).toBe("已保存的课程介绍")
  })

  it("shows saved session conditions without inventing capacity or blocking publication", () => {
    // Given
    const update = vi.fn()
    const host = mount(() => h(SessionPanel, { catalogItems: [catalog], schools: [school], tourSessions: [session], noticeVersions: [], error: "", formError: "", loading: false, submitting: false, onUpdate: update }))
    // When
    const publish = Array.from(host.querySelectorAll("button")).find(button => button.textContent?.trim() === "发布")
    publish?.click()
    // Then
    expect(host.textContent).toContain("团期待发布")
    expect(host.textContent).toContain("告知书未启用")
    expect(host.textContent).toContain("名额待核实")
    expect(update).toHaveBeenCalledWith({ id: "session", payload: { status: "published" } })
  })
})
