import { createApp, h, nextTick } from "vue"
import { createMemoryHistory, createRouter, RouterView } from "vue-router"
import { afterEach, describe, expect, it, vi } from "vitest"
import AdminLayout from "@/layouts/AdminLayout.vue"
import PretripView from "@/views/PretripView.vue"
import TransportView from "@/views/TransportView.vue"

vi.mock("@/router/routes", () => ({ routeNames: { login: "login" } }))

async function mountLayout() {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input)
    if (path.endsWith("/staff/auth/me")) return Response.json({ actorId: "staff-1", kind: "administrator", forcePasswordChange: false, permissionKeys: ["pretrip.write", "transport.read"], scopes: [{ kind: "all", id: null }] })
    if (path.endsWith("/capabilities")) return Response.json({ wechatPaymentEnabled: true, wechatRefundEnabled: true, paymentReconciliationEnabled: true })
    if (path.endsWith("/tour-sessions")) return Response.json(["1", "2"].map(id => ({ id: `session-${id}`, organizationId: `school-${id}`, catalogItemId: "catalog-1", code: `团期${id}`, status: "published", priceFen: 100, capacity: 30, startsAt: "2027-02-01T00:00:00Z", endsAt: "2027-02-02T00:00:00Z" })))
    if (path.endsWith("/schools") || path.endsWith("/grades")) return Response.json([])
    throw new Error(`Unexpected request: ${path}`)
  }))
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/", component: AdminLayout, children: [{ path: "pretrip", component: PretripView }, { path: "transport", component: TransportView }, { path: "other", component: { render: () => h("p", "其他页面") } }] }] })
  await router.push("/pretrip?tourSessionId=session-1")
  const host = document.createElement("div")
  document.body.append(host)
  const app = createApp({ render: () => h(RouterView) }).use(router)
  app.mount(host)
  await vi.waitFor(() => expect(host.querySelector<HTMLSelectElement>("select")?.value).toBe("session-1"))
  async function select(value: string) {
    const input = host.querySelector("select")
    if (!(input instanceof HTMLSelectElement)) throw new Error("Missing session selection")
    input.value = value
    input.dispatchEvent(new Event("change", { bubbles: true }))
    await nextTick()
  }
  const target = () => [...host.querySelectorAll("a")].find(link => link.textContent === "车辆安排")?.getAttribute("href")
  return { app, router, host, select, target }
}

describe("pending session navigation", () => {
  afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren() })

  it("clears a rejected navigation and leaves the committed session link", async () => {
    // Given
    const page = await mountLayout()
    let release: ((value: boolean) => void) | undefined
    const pending = new Promise<boolean>(resolve => { release = resolve })
    page.router.beforeEach(() => pending)
    try {
      // When
      await page.select("session-2")
      expect(page.target()).toBe("/transport?tourSessionId=session-2")
      release?.(false)
      // Then
      await vi.waitFor(() => expect(page.target()).toBe("/transport?tourSessionId=session-1"))
      expect(page.router.currentRoute.value.query["tourSessionId"]).toBe("session-1")
    } finally { page.app.unmount() }
  })

  it("keeps the new pending selection when an older cancelled request settles", async () => {
    // Given
    const page = await mountLayout()
    const releases: ((value: boolean) => void)[] = []
    page.router.beforeEach(() => new Promise<boolean>(resolve => { releases.push(resolve) }))
    try {
      await page.select("session-2")
      await vi.waitFor(() => expect(releases).toHaveLength(1))
      // When: A → B → A cancels B, then a fresh B starts before the old B settles.
      await page.select("session-1")
      await vi.waitFor(() => expect(page.target()).toBe("/transport?tourSessionId=session-1"))
      await page.select("session-2")
      await vi.waitFor(() => expect(releases).toHaveLength(2))
      releases[0]?.(true)
      await nextTick()
      await nextTick()
      // Then
      expect(page.target()).toBe("/transport?tourSessionId=session-2")
      expect(page.router.currentRoute.value.query["tourSessionId"]).toBe("session-1")
      releases[1]?.(true)
      await vi.waitFor(() => expect(page.router.currentRoute.value.query["tourSessionId"]).toBe("session-2"))
      expect(page.target()).toBe("/transport?tourSessionId=session-2")
    } finally { releases.forEach(release => release(true)); page.app.unmount() }
  })

  it("carries an explicit clear immediately and does not leak it after leaving the page", async () => {
    // Given
    const page = await mountLayout()
    let release: ((value: boolean) => void) | undefined
    const pending = new Promise<boolean>(resolve => { release = resolve })
    page.router.beforeEach(to => to.path === "/pretrip" && to.query["tourSessionId"] === undefined ? pending : true)
    try {
      // When
      await page.select("")
      // Then
      expect(page.target()).toBe("/transport")
      await page.router.push("/other")
      release?.(true)
      await page.router.push("/pretrip?tourSessionId=session-2")
      await vi.waitFor(() => expect(page.target()).toBe("/transport?tourSessionId=session-2"))
    } finally { release?.(true); page.app.unmount() }
  })
})
