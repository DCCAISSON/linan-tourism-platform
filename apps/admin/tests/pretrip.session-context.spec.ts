import { createApp, nextTick } from "vue"
import { createMemoryHistory, createRouter } from "vue-router"
import { afterEach, describe, expect, it, vi } from "vitest"
import PretripView from "@/views/PretripView.vue"

const config = { tourSessionId: "session-1", gatheringAt: null, gatheringPlace: "第一团集合点", gatheringLatitude: null, gatheringLongitude: null, travelMode: "group", itineraryNote: "第一团提示", contactName: "联系人", contactPhone: "19900000000", serviceContact: "服务台", noticeVersionId: null, version: 7, attachments: [] }
const confirmation = { id: "confirmed-1", tourSessionId: "session-1", schoolId: "旧学校", transportConfirmationId: "plan-1", planVersion: 4, rosterVersion: "roster-1", status: "current", signedAt: "2026-10-04T08:00:00Z", signedByStaffId: "staff-1" }

async function mountPage(respond: (path: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
    if (path.endsWith("/staff/auth/me")) return Response.json({ actorId: "staff-1", kind: "administrator", forcePasswordChange: false, permissionKeys: ["pretrip.write"], scopes: [{ kind: "all", id: null }] })
    if (path.endsWith("/tour-sessions")) return Response.json(["1", "2"].map(id => ({ id: `session-${id}`, organizationId: `school-${id}`, catalogItemId: "catalog-1", code: `团期${id}`, status: "published", priceFen: 100, capacity: 30, startsAt: "2027-02-01T00:00:00.000Z", endsAt: "2027-02-02T00:00:00.000Z" })))
    return respond(path, init)
  }))
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/pretrip", component: PretripView }] })
  await router.push("/pretrip")
  await router.isReady()
  const host = document.createElement("div")
  document.body.append(host)
  const app = createApp(PretripView).use(router)
  app.mount(host)
  await vi.waitFor(() => expect(host.textContent).toContain("团期1"))
  async function select(value: string): Promise<void> {
    const input = host.querySelector("select")
    if (!(input instanceof HTMLSelectElement)) throw new Error("Missing session select")
    input.value = value
    input.dispatchEvent(new Event("change", { bubbles: true }))
    await nextTick()
  }
  function click(text: string): void {
    const button = [...host.querySelectorAll("button")].find(item => item.textContent?.trim() === text)
    if (button === undefined) throw new Error(`Missing ${text}`)
    button.click()
  }
  return { app, host, select, click }
}

describe("pretrip session changes", () => {
  afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren() })

  it("clears old form, confirmations and version before saving another session", async () => {
    // Given
    const payloads: unknown[] = []
    const page = await mountPage(async (path, init) => {
      if (init?.method === "PUT") payloads.push(JSON.parse(String(init.body)))
      return Response.json(path.endsWith("/school-confirmations") ? [confirmation] : config)
    })
    try {
      await page.select("session-1")
      page.click("读取配置")
      await vi.waitFor(() => expect(page.host.textContent).toContain("旧学校"))
      // When
      await page.select("session-2")
      // Then
      expect(page.host.querySelector<HTMLInputElement>('input[type="text"]')?.value).toBe("")
      expect(page.host.textContent).not.toContain("旧学校")
      page.click("保存配置")
      await vi.waitFor(() => expect(payloads).toHaveLength(1))
      expect(payloads[0]).toMatchObject({ expectedVersion: 0, gatheringPlace: "", itineraryNote: "" })
    } finally { page.app.unmount() }
  })

  it("ignores a previous load after switching away and back to the same session", async () => {
    // Given
    let release: ((value: Response) => void) | undefined
    const pending = new Promise<Response>(resolve => { release = resolve })
    let requested = false
    const page = await mountPage(async path => {
      if (path.endsWith("/school-confirmations")) return Response.json([])
      requested = true
      return pending
    })
    try {
      await page.select("session-1")
      page.click("读取配置")
      await vi.waitFor(() => expect(requested).toBe(true))
      // When
      await page.select("session-2")
      await page.select("session-1")
      release?.(Response.json(config))
      await pending
      await vi.waitFor(() => expect(page.host.querySelector('button[type="submit"]')?.hasAttribute("disabled")).toBe(false))
      // Then
      expect(page.host.querySelector<HTMLInputElement>('input[type="text"]')?.value).toBe("")
      expect(page.host.textContent).not.toContain("配置已读取")
    } finally { page.app.unmount() }
  })
})
