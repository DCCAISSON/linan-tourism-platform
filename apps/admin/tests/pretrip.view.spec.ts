import { createApp, nextTick } from "vue"
import { afterEach, describe, expect, it, vi } from "vitest"
import PretripView from "@/views/PretripView.vue"

const attachment = { id: "file-1", title: "行前须知.pdf", contentType: "application/pdf", byteSize: 128 }
const config = { tourSessionId: "session-1", gatheringAt: "2027-02-01T01:00:00.000Z", gatheringPlace: "学校南门", gatheringLatitude: null, gatheringLongitude: null, travelMode: "group", itineraryNote: "携带水杯", contactName: "服务人员", contactPhone: "19900000000", serviceContact: "服务台", noticeVersionId: null, version: 1, attachments: [attachment] }

describe("pretrip attachment editing", () => {
  afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren() })

  it("does not erase existing attachments when staff saves gathering information", async () => {
    // Given
    const payloads: unknown[] = []
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      if (path.endsWith("/tour-sessions")) return Response.json([{ id: "session-1", organizationId: "school-1", catalogItemId: "catalog-1", code: "春季团", status: "published", priceFen: 100, capacity: 30, startsAt: "2027-02-01T00:00:00.000Z", endsAt: "2027-02-02T00:00:00.000Z", enrollmentOpensAt: null, enrollmentClosesAt: null }])
      if (path.endsWith("/school-confirmations")) return Response.json([])
      if (init?.method === "PUT") payloads.push(JSON.parse(String(init.body)))
      return Response.json(config)
    }))
    const host = document.createElement("div")
    document.body.append(host)
    const app = createApp(PretripView)
    app.mount(host)
    try {
      await vi.waitFor(() => expect(host.textContent).toContain("春季团"))
      const select = host.querySelector("select")
      if (!(select instanceof HTMLSelectElement)) throw new Error("Missing session selection")
      select.value = "session-1"
      select.dispatchEvent(new Event("change", { bubbles: true }))
      await nextTick()
      button(host, "读取配置").click()
      await vi.waitFor(() => expect(host.textContent).toContain(attachment.title))
      expect(host.querySelector<HTMLInputElement>('input[type="datetime-local"]')?.value).toBe("2027-02-01T09:00")
      // When
      button(host, "保存配置").click()
      await vi.waitFor(() => expect(payloads).toHaveLength(1))
      // Then
      expect(payloads[0]).not.toHaveProperty("attachments")
      expect(payloads[0]).toHaveProperty("gatheringAt", "2027-02-01T01:00:00.000Z")
    } finally { app.unmount() }
  })
})

function button(host: HTMLElement, text: string): HTMLButtonElement {
  const found = [...host.querySelectorAll("button")].find((element) => element.textContent?.trim() === text)
  if (found === undefined) throw new Error(`Missing button ${text}`)
  return found
}
