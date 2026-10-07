import { afterEach, describe, expect, it, vi } from "vitest"
import { createApp, h, nextTick } from "vue"
import SessionPanel from "../src/views/configuration/SessionPanel.vue"
import SessionEnrollmentConditions from "../src/views/configuration/SessionEnrollmentConditions.vue"
import CatalogPanel from "../src/views/configuration/CatalogPanel.vue"
import { parseCatalogItem, parseNoticeVersion, parseTourSession } from "../src/api/configuration.parsers"
import { useCatalogSessions } from "../src/views/configuration/useCatalogSessions"

vi.mock("../src/views/configuration/SessionCreateForm.vue", () => ({ default: { render: () => null } }))
vi.mock("../src/views/configuration/SessionEditForm.vue", () => ({ default: { render: () => null } }))
const apps: ReturnType<typeof createApp>[] = []
const school = { id: "school", code: "school", name: "临安小学" }
const catalog = parseCatalogItem({ id: "catalog", organizationId: "school", title: "山野研学", status: "active", description: "已保存课程介绍", coverImageUrl: "https://images.example/saved.jpg" })
const notice = parseNoticeVersion({ id: "notice", organizationId: "school", tourSessionId: "session", version: "v1", title: "已启用告知书", contentJson: { destination: "已保存目的地", departurePlace: "校门口", mealNote: "含午餐", itinerary: ["已保存行程"], unitPrices: ["费用含车费"], packageExamples: ["学生成人同价"], reminders: ["已生效须知"] } })
const session = parseTourSession({ id: "session", organizationId: "school", catalogItemId: "catalog", code: "一期", status: "published", capacity: 30, occupiedCapacity: 5, priceFen: 12800, startsAt: "2026-10-20T00:00:00Z", endsAt: "2026-10-20T08:00:00Z", enrollmentOpensAt: "2026-10-01T00:00:00Z", enrollmentClosesAt: "2026-10-19T00:00:00Z", activeNoticeId: "notice", activeNotice: notice })
afterEach(() => { apps.splice(0).forEach(app => app.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals() })

function mount(render: () => ReturnType<typeof h>) {
  const host = document.createElement("div")
  document.body.append(host)
  const app = createApp(render)
  apps.push(app); app.mount(host)
  return host
}
async function fill(id: string, value: string) {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLSelectElement || element instanceof HTMLInputElement)) throw new Error(`Missing ${id}`)
  element.value = value
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }))
  await nextTick()
}

describe("saved content preview", () => {
  it("keeps the effective notice separate from the draft being entered", async () => {
    // Given
    const host = mount(() => h(SessionPanel, { catalogItems: [catalog], schools: [school], tourSessions: [session], noticeVersions: [notice], error: "", formError: "", loading: false, submitting: false }))
    // When
    await fill("notice-session", "session")
    await fill("notice-destination", "未保存的新目的地")
    // Then
    const saved = host.querySelector("#session-saved-session")
    expect(saved?.textContent).toContain("已保存目的地")
    expect(saved?.textContent).toContain("已生效须知")
    expect(saved?.textContent).toContain("临安小学")
    expect(saved?.textContent).toContain("128.00")
    expect(saved?.textContent).not.toContain("未保存的新目的地")
    expect(host.querySelector(".notice-preview")?.textContent).toContain("未保存的新目的地")
    expect(saved?.querySelector("img")?.src).toBe(catalog.coverImageUrl)
  })

  it("gives a newly saved course an entry that opens again after manual closing", async () => {
    // Given
    const state = useCatalogSessions()
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(catalog), { status: 201 })))
    const host = mount(() => h(CatalogPanel, { catalogItems: state.catalogItems.value, schools: [school], error: "", formError: state.catalogFormError.value, loading: false, submitting: state.catalogSubmitting.value, success: state.catalogSuccess.value, savedId: state.catalogSavedId.value }))
    await state.submitCatalogItem({ organizationId: "school", code: "new", title: "山野研学", status: "active" })
    await nextTick()
    const link = host.querySelector<HTMLAnchorElement>('a[href="#catalog-saved-catalog"]')
    link?.click()
    await nextTick()
    const preview = host.querySelector<HTMLDetailsElement>("#catalog-saved-catalog")
    if (!preview) throw new Error("Missing saved entry")
    expect(preview.open).toBe(true)
    preview.open = false
    preview.dispatchEvent(new Event("toggle"))
    await nextTick()
    // When
    link?.click()
    await nextTick()
    // Then
    expect(preview.open).toBe(true)
    expect(preview.textContent).toContain("已保存课程介绍")
  })

  it("shows publication success only after the mutation and clears it on failure", async () => {
    // Given
    const state = useCatalogSessions()
    state.tourSessions.value = [session]
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(session))))
    await state.updateSession({ id: session.id, payload: { status: "published" } })
    expect(state.sessionSuccess.value).toContain("团期已发布")
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "操作失败" }), { status: 503 })))
    // When
    await state.updateSession({ id: session.id, payload: { status: "closed" } })
    // Then
    expect(state.sessionSuccess.value).toBe("")
    expect(state.sessionSavedId.value).toBe("")
    expect(state.tourSessions.value[0]?.status).toBe("published")
  })
})

describe("saved enrollment conditions", () => {
  it.each([
    ["2026-09-01T00:00:00Z", "报名尚未开始"],
    ["2026-10-07T00:00:00Z", "在报名时间内"],
    ["2026-10-20T00:00:00Z", "报名已截止"],
  ])("reports the real enrollment window at %s", (now, label) => {
    // Given / When
    const host = mount(() => h(SessionEnrollmentConditions, { catalog, session, now: Date.parse(now) }))
    // Then
    expect(host.textContent).toContain(label)
    expect(host.textContent).toContain("剩余 25 个名额")
  })

  it("keeps closed trips browsable and reports full capacity from saved occupancy", () => {
    // Given / When
    const host = mount(() => h(SessionEnrollmentConditions, { catalog, session: { ...session, status: "closed", occupiedCapacity: 30 }, now: Date.parse("2026-10-07") }))
    // Then
    expect(host.textContent).toContain("报名已关闭，课程启用时家长仍可浏览")
    expect(host.textContent).toContain("已满额")
    expect(host.textContent).toContain("30 / 容量 30")
  })

  it("reports missing course, dates and occupancy as unverified", () => {
    // Given / When
    const host = mount(() => h(SessionEnrollmentConditions, { catalog: undefined, session: { ...session, occupiedCapacity: null, enrollmentOpensAt: "" }, now: Date.now() }))
    // Then
    expect(host.textContent).toContain("课程状态待核实")
    expect(host.textContent).toContain("报名时间待核实")
    expect(host.textContent).toContain("名额待核实")
    expect(host.textContent).not.toContain("剩余")
  })
})
