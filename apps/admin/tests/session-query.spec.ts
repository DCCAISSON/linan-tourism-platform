import { createApp, defineComponent, h, onMounted, ref } from "vue"
import { createMemoryHistory, createRouter, isNavigationFailure, RouterView } from "vue-router"
import { describe, expect, it } from "vitest"
import { useSessionQuery } from "@/layouts/useSessionQuery"

async function mountSelection() {
  const locked = ref(false)
  const Page = defineComponent({ setup() {
    const selected = ref("")
    const query = useSessionQuery(selected, id => ["session-1", "session-2"].includes(id), () => locked.value)
    onMounted(query.initialize)
    return () => h("p", selected.value)
  } })
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/session", component: Page }, { path: "/other", component: { render: () => h("p", "other") } }] })
  await router.push("/session?tourSessionId=session-1")
  const host = document.createElement("div")
  document.body.append(host)
  const app = createApp({ render: () => h(RouterView) }).use(router)
  app.mount(host)
  return { router, host, locked, dispose: () => { app.unmount(); host.remove() } }
}

describe("session query during an operation", () => {
  it("holds the current session during a read or write and accepts a later change", async () => {
    // Given
    const page = await mountSelection()
    page.locked.value = true
    try {
      // When
      const result = await page.router.push("/session?tourSessionId=session-2")
      // Then
      expect(isNavigationFailure(result)).toBe(true)
      expect(page.host.textContent).toBe("session-1")
      expect(page.router.currentRoute.value.query["tourSessionId"]).toBe("session-1")
      page.locked.value = false
      await page.router.push("/session?tourSessionId=session-2")
      expect(page.host.textContent).toBe("session-2")
    } finally { page.dispose() }
  })

  it("allows leaving the module during an operation", async () => {
    // Given
    const page = await mountSelection()
    page.locked.value = true
    try {
      // When
      await page.router.push("/other")
      // Then
      expect(page.host.textContent).toBe("other")
      expect(page.router.currentRoute.value.path).toBe("/other")
    } finally { page.dispose() }
  })
})
