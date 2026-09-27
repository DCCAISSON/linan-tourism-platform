import { createApp, nextTick } from "vue"
import { afterEach, expect, it, vi } from "vitest"
import MediaView from "@/views/MediaView.vue"

afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren() })

it("blocks provider editing while a collection reload can replace its fields", async () => {
  let completeRead: (value: Response) => void = () => undefined
  const collectionRead = new Promise<Response>(resolve => { completeRead = resolve })
  vi.stubGlobal("fetch", vi.fn(async input => String(input).endsWith("/sessions")
    ? Response.json([{ id: "session", code: "研学团" }]) : collectionRead))
  const root = document.createElement("div")
  document.body.append(root)
  const app = createApp(MediaView)
  app.mount(root)
  await vi.waitFor(() => expect(root.textContent).toContain("研学团"))
  const session = root.querySelector("select")
  if (!(session instanceof HTMLSelectElement)) throw new Error("Session selector missing")
  session.value = "session"
  session.dispatchEvent(new Event("change", { bubbles: true }))
  await nextTick()
  const read = root.querySelector(".media-form button")
  if (!(read instanceof HTMLButtonElement)) throw new Error("Read button missing")
  read.click()
  await nextTick()
  const inputs = [...root.querySelectorAll(".media-provider input")]
  const save = root.querySelector(".media-provider button")
  expect(inputs.every(input => input instanceof HTMLInputElement && input.disabled)).toBe(true)
  expect(save instanceof HTMLButtonElement && save.disabled).toBe(true)
  completeRead(Response.json({ assets: [], providers: [{ kind: "album", label: "当前相册", url: "https://album.example.test/a", enabled: true, version: 1 }] }))
  await vi.waitFor(() => expect(root.querySelector<HTMLInputElement>(".media-provider label:nth-child(2) input")?.value).toBe("当前相册"))
  expect(root.querySelector<HTMLInputElement>(".media-provider label:nth-child(2) input")?.disabled).toBe(false)
  app.unmount()
})
