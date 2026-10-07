import { afterEach, describe, expect, it, vi } from "vitest"
import { createApp, h, nextTick } from "vue"
import CatalogPanel from "../src/views/configuration/CatalogPanel.vue"
import SessionCreateForm from "../src/views/configuration/SessionCreateForm.vue"
import SessionEditForm from "../src/views/configuration/SessionEditForm.vue"
import { parseCatalogItem, parseTourSession } from "../src/api/configuration.parsers"

vi.mock("../src/views/configuration/SessionEnrollmentScope.vue", () => ({ default: { render: () => null } }))
const apps: ReturnType<typeof createApp>[] = []
const school = { id: "school", code: "school", name: "临安小学" }
const catalog = parseCatalogItem({ id: "catalog", organizationId: "school", title: "自然观察", status: "active", description: "原介绍", coverImageUrl: "" })
const session = parseTourSession({ id: "session", organizationId: "school", catalogItemId: "catalog", code: "一期", status: "draft", priceFen: 12800, capacity: 30, occupiedCapacity: 12, startsAt: "2026-10-20T00:00:00Z", endsAt: "2026-10-20T08:00:00Z", enrollmentOpensAt: "2026-09-30T16:15:00Z", enrollmentClosesAt: "2026-10-19T12:30:45Z" })
afterEach(() => { apps.splice(0).forEach(app => app.unmount()); document.body.replaceChildren() })

function mount(render: () => ReturnType<typeof h>): HTMLDivElement {
  const host = document.createElement("div")
  document.body.append(host)
  const app = createApp(render)
  apps.push(app)
  app.mount(host)
  return host
}

async function setField(host: HTMLElement, id: string, value: string): Promise<void> {
  const field = host.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)
  expect(field, id).not.toBeNull()
  if (!field) return
  field.value = value
  field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }))
  await nextTick()
}

function submit(host: HTMLElement, index = 0): void {
  host.querySelectorAll("form")[index]?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
}

describe("course self service", () => {
  it("saves the edited ordinary course name and enabled state with its content", async () => {
    const update = vi.fn()
    const host = mount(() => h(CatalogPanel, { catalogItems: [catalog], schools: [school], loading: false, submitting: false, error: "", formError: "", onUpdate: update }))
    await setField(host, "catalog-edit", "catalog")
    await setField(host, "catalog-edit-title", "天目山自然观察")
    await setField(host, "catalog-edit-status", "disabled")
    submit(host, 1)
    expect(update).toHaveBeenCalledWith({ id: "catalog", payload: { title: "天目山自然观察", status: "disabled", description: "原介绍", coverImageUrl: "" } })
  })

  it("rejects an empty course name without submitting", async () => {
    const update = vi.fn()
    const host = mount(() => h(CatalogPanel, { catalogItems: [catalog], schools: [school], loading: false, submitting: false, error: "", formError: "", onUpdate: update }))
    await setField(host, "catalog-edit", "catalog")
    await setField(host, "catalog-edit-title", " ")
    submit(host, 1)
    await nextTick()
    expect(update).not.toHaveBeenCalled()
    expect(host.textContent).toContain("请填写课程名称")
  })
})

describe("session capacity and Beijing enrollment time", () => {
  it("loads the real Beijing date and minute instead of the UTC date alone", () => {
    const host = mount(() => h(SessionEditForm, { tourSessions: [session], submitting: false, formError: "" }))
    expect(host.querySelector<HTMLInputElement>("#session-edit-open")?.value).toBe("2026-10-01T00:15")
    expect(host.querySelector<HTMLInputElement>("#session-edit-close")?.value).toBe("2026-10-19T20:30")
    expect(host.querySelector<HTMLInputElement>("#session-edit-capacity")?.value).toBe("30")
  })

  it("saves capacity and the chosen exact cutoff while preserving the unchanged opening instant", async () => {
    const update = vi.fn()
    const host = mount(() => h(SessionEditForm, { tourSessions: [session], submitting: false, formError: "", onUpdate: update }))
    await setField(host, "session-edit-capacity", "40")
    await setField(host, "session-edit-close", "2026-10-19T23:59")
    submit(host)
    expect(update).toHaveBeenCalledWith({ id: "session", payload: expect.objectContaining({ capacity: 40, enrollmentOpensAt: session.enrollmentOpensAt, enrollmentClosesAt: "2026-10-19T15:59:00.000Z" }) })
  })

  it("does not round an existing cutoff to minutes when changing another field", async () => {
    const update = vi.fn()
    const host = mount(() => h(SessionEditForm, { tourSessions: [session], submitting: false, formError: "", onUpdate: update }))
    await setField(host, "session-edit-capacity", "31")
    submit(host)
    expect(update).toHaveBeenCalledWith({ id: "session", payload: expect.objectContaining({ enrollmentClosesAt: session.enrollmentClosesAt }) })
  })

  it.each(["0", "-1", "1.5", "11"])("rejects invalid or already occupied capacity %s", async capacity => {
    const update = vi.fn()
    const host = mount(() => h(SessionEditForm, { tourSessions: [session], submitting: false, formError: "", onUpdate: update }))
    await setField(host, "session-edit-capacity", capacity)
    submit(host)
    expect(update).not.toHaveBeenCalled()
  })

  it("validates minimum participants against the new capacity", async () => {
    const update = vi.fn()
    const host = mount(() => h(SessionEditForm, { tourSessions: [session], submitting: false, formError: "", onUpdate: update }))
    await setField(host, "session-edit-capacity", "40")
    await setField(host, "session-edit-minimum", "35")
    submit(host)
    expect(update).toHaveBeenCalledWith({ id: "session", payload: expect.objectContaining({ capacity: 40, minimumParticipants: 35 }) })
  })

  it("rejects a cutoff before the opening time", async () => {
    const update = vi.fn()
    const host = mount(() => h(SessionEditForm, { tourSessions: [session], submitting: false, formError: "", onUpdate: update }))
    await setField(host, "session-edit-close", "2026-10-01T00:14")
    submit(host)
    await nextTick()
    expect(update).not.toHaveBeenCalled()
    expect(host.textContent).toContain("报名截止不能早于报名开始")
  })

  it("creates a session using Beijing time including midnight across UTC dates", async () => {
    const create = vi.fn()
    const host = mount(() => h(SessionCreateForm, { catalogItems: [catalog], schools: [school], submitting: false, formError: "", onCreate: create }))
    for (const [id, value] of Object.entries({ "session-code": "新一期", "session-price": "128", "session-capacity": "30", "session-start": "2026-10-20", "session-end": "2026-10-20", "enrollment-open": "2026-10-01T00:15", "enrollment-close": "2026-10-19T20:30" })) await setField(host, id, value)
    submit(host)
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ enrollmentOpensAt: "2026-09-30T16:15:00.000Z", enrollmentClosesAt: "2026-10-19T12:30:00.000Z" }))
  })
})
