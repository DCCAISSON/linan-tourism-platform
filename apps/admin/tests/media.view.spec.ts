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

it("refreshes the failed upload record while retaining the actual failure message", async () => {
  // Given an empty collection and a failed upload that leaves failed metadata.
  let attempted = false
  vi.stubGlobal("fetch", vi.fn(async (input, init?: RequestInit) => {
    if (String(input).endsWith("/sessions")) return Response.json([{ id: "session", code: "研学团" }])
    if (init?.method === "POST") {
      attempted = true
      return Response.json({ message: "暂时无法上传，请联系工作人员后重试。" }, { status: 503 })
    }
    return Response.json({ assets: attempted ? [{ id: "failed", tourSessionId: "session", title: "试用合影", kind: "image", contentType: "image/png", byteSize: 8, status: "failed", version: 2, authorStaffId: "guide", createdAt: "2026-10-03T00:00:00Z", cleanupPending: false }] : [], providers: [] })
  }))
  const root = document.createElement("div")
  document.body.append(root)
  const app = createApp(MediaView)
  app.mount(root)
  await vi.waitFor(() => expect(root.textContent).toContain("研学团"))
  const session = root.querySelector("select")
  const file = root.querySelector('input[type="file"]')
  const form = root.querySelectorAll("form")[1]
  if (!(session instanceof HTMLSelectElement) || !(file instanceof HTMLInputElement) || !(form instanceof HTMLFormElement)) throw new Error("Media form missing")
  session.value = "session"
  session.dispatchEvent(new Event("change", { bubbles: true }))
  Object.defineProperty(file, "files", { value: [new File(["test"], "trial.png", { type: "image/png" })] })
  file.dispatchEvent(new Event("change", { bubbles: true }))
  await nextTick()
  // When the guide submits the selected file.
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  // Then the failed record is shown without hiding the upload error or inventing a residual file.
  await vi.waitFor(() => expect(root.querySelector(".media-asset")?.textContent).toContain("试用合影"))
  expect(root.querySelector('[role="alert"]')?.textContent).toBe("暂时无法上传，请联系工作人员后重试。")
  expect(root.textContent).not.toContain("残留")
  app.unmount()
})
