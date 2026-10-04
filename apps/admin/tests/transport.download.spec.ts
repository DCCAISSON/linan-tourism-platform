import { afterEach, describe, expect, it, vi } from "vitest"
import { downloadTransportPeoplePlan } from "@/api/transport"

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe("final transport workbook download", () => {
  it("downloads the confirmed people endpoint using staff cookies and a distinct filename", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["xlsx"]) })
    vi.stubGlobal("fetch", request)
    const createUrl = vi.fn().mockReturnValue("blob:transport-people")
    const revokeUrl = vi.fn()
    Object.defineProperty(URL, "createObjectURL", { value: createUrl, configurable: true })
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeUrl, configurable: true })
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("最终逐人分车名单-session-1.xlsx")
      expect(this.href).toBe("blob:transport-people")
    })

    await downloadTransportPeoplePlan("session-1")

    expect(request).toHaveBeenCalledWith(expect.stringContaining("/transport/sessions/session-1/people-export.xlsx"), { method: "GET", credentials: "include" })
    expect(click).toHaveBeenCalledOnce()
    expect(revokeUrl).toHaveBeenCalledWith("blob:transport-people")
  })

  it("shows the API conflict when a saved change invalidates confirmation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 409,
      json: async () => ({ code: "transport_not_current", message: "车辆安排已过期，请重新确认后导出。" }) }))
    await expect(downloadTransportPeoplePlan("session-1")).rejects.toThrow("车辆安排已过期，请重新确认后导出。")
  })
})
