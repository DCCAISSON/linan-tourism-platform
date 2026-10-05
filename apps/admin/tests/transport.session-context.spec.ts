import { createApp } from "vue"
import { createMemoryHistory, createRouter } from "vue-router"
import { afterEach, expect, it, vi } from "vitest"
import TransportView from "@/views/TransportView.vue"

afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren() })

it("ignores a transport response from before a session round trip", async () => {
  // Given
  let release: ((value: Response) => void) | undefined
  const pending = new Promise<Response>(resolve => { release = resolve })
  let requested = false
  const peopleRequests: string[] = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input)
    if (path.endsWith("/staff/auth/me")) return Response.json({ actorId: "staff-1", kind: "administrator", forcePasswordChange: false, permissionKeys: ["transport.read", "transport.write"], scopes: [{ kind: "all", id: null }] })
    if (path.endsWith("/tour-sessions")) return Response.json(["1", "2"].map(id => ({ id: `session-${id}`, organizationId: `school-${id}`, catalogItemId: "catalog-1", code: `团期${id}`, status: "published", priceFen: 100, capacity: 30, startsAt: "2027-02-01T00:00:00Z", endsAt: "2027-02-02T00:00:00Z" })))
    if (path.endsWith("/schools")) return Response.json(["1", "2"].map(id => ({ id: `school-${id}`, code: id, name: `学校${id}` })))
    if (path.endsWith("/plan")) { requested = true; return pending }
    if (path.endsWith("/people-plan")) peopleRequests.push(path)
    return Response.json([])
  }))
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/transport", component: TransportView }] })
  await router.push("/transport?tourSessionId=session-1")
  await router.isReady()
  const host = document.createElement("div")
  document.body.append(host)
  const app = createApp(TransportView).use(router)
  app.mount(host)
  try {
    await vi.waitFor(() => expect(host.querySelector<HTMLSelectElement>("#transport-session")?.value).toBe("session-1"))
    host.querySelector<HTMLButtonElement>('button[type="submit"]')?.click()
    await vi.waitFor(() => expect(requested).toBe(true))
    // When
    await router.push("/transport?tourSessionId=session-2")
    await router.push("/transport?tourSessionId=session-1")
    release?.(Response.json({ tourSessionId: "session-1", organizationId: "school-1", planVersion: 8, vehicles: [], totals: { studentCount: 0, guardianCount: 0, teacherCount: 0, otherCount: 0, occupancy: 0, seatCapacity: 0 }, warnings: ["旧团期请求结果"] }))
    await pending
    await vi.waitFor(() => expect(host.querySelector('button[type="submit"]')?.hasAttribute("disabled")).toBe(false))
    // Then
    expect(host.textContent).not.toContain("旧团期请求结果")
    expect(host.textContent).not.toContain("v8")
    expect(peopleRequests).toEqual([])
  } finally { app.unmount() }
})
