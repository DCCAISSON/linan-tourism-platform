import { createApp } from "vue"
import { createMemoryHistory, createRouter } from "vue-router"
import ElementPlus from "element-plus"
import { afterEach, describe, expect, it, vi } from "vitest"
import GuideSessionView from "@/views/GuideSessionView.vue"
import { guideSession } from "./execution.fixtures"

const apps: ReturnType<typeof createApp>[] = []
async function mountGuide(confirmationStatus = "current") {
  const request = vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    if (url.endsWith("/staff/auth/me")) return Response.json({ actorId: "guide-1", kind: "staff", forcePasswordChange: false, permissionKeys: ["execution.read", "execution.write"], scopes: [] })
    if (url.endsWith("/person-daily-reports")) return Response.json([])
    if (url.endsWith("/nodes")) return Response.json({ nodes: [], records: [], counts: null })
    return Response.json({ ...guideSession, confirmationStatus })
  })
  vi.stubGlobal("fetch", request)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/execution/sessions/:sessionId", component: GuideSessionView }] })
  await router.push("/execution/sessions/session-1")
  await router.isReady()
  const host = document.createElement("div")
  document.body.append(host)
  const app = createApp(GuideSessionView).use(router).use(ElementPlus)
  app.mount(host)
  apps.push(app)
  await vi.waitFor(() => expect(document.body.textContent).toContain("研学团"))
  return request
}

describe("guide confirmed execution surface", () => {
  afterEach(() => { apps.splice(0).forEach(app => app.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals() })

  it.each(["stale", "unconfirmed"])("hides draft people and person writes when confirmation is %s", async state => {
    await mountGuide(state)
    expect(document.body.textContent).toContain("安排待确认")
    expect(document.body.textContent).not.toContain("学生甲")
    expect([...document.querySelectorAll("button")].some(button => button.textContent?.trim() === "到齐")).toBe(false)
  })

  it("switches to a minimal read-only group roster without attendance buttons", async () => {
    await mountGuide()
    const button = [...document.querySelectorAll("button")].find(item => item.textContent?.trim() === "全团名单（只读）")
    expect(button).toBeDefined()
    button?.click()
    await vi.waitFor(() => expect(document.body.textContent).toContain("学生乙"))
    expect(document.body.textContent).toContain("2号车")
    expect([...document.querySelectorAll("button")].some(item => item.textContent?.trim() === "到齐")).toBe(false)
    expect(document.querySelector("textarea")).toBeNull()
  })
})
