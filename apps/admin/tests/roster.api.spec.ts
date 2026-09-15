import { afterEach, describe, expect, it, vi } from "vitest"

import { downloadRosterExport, getRosterSummary, readableRosterError, RosterApiError } from "@/api/roster"

describe("roster API", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("requests summary with development staff headers and parses the response", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () =>
        new Response(
          JSON.stringify({
            filters: { tourSessionId: "session-1" },
            paidHeadcount: 1,
            paidAmountFen: 12800,
            rows: [],
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
    )
    vi.stubGlobal("fetch", fetchMock)

    const summary = await getRosterSummary({ tourSessionId: "session-1", schoolId: "school-1" })

    const call = fetchMock.mock.calls[0]
    expect(call).toBeDefined()
    if (call === undefined) {
      throw new Error("fetch was not called")
    }
    const headers = new Headers(call[1]?.headers)
    expect(call[0]).toBe("http://127.0.0.1:3000/roster/summary?tourSessionId=session-1&schoolId=school-1")
    expect(headers.get("x-linan-dev-staff-id")).toBe("dev-admin")
    expect(headers.get("x-linan-dev-staff-role")).toBe("administrator")
    expect(summary.paidHeadcount).toBe(1)
  })

  it("returns the server message when the summary request fails", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () =>
        new Response(JSON.stringify({ message: "名单服务暂不可用" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(getRosterSummary({ tourSessionId: "session-1" })).rejects.toThrow("名单服务暂不可用")
  })

  it("downloads the export file with the same query and headers", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () =>
        new Response("xlsx", {
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
        }),
    )
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:roster")
    const revokeObjectURL = vi.fn<(url: string) => void>()
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    })
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    })
    vi.stubGlobal("fetch", fetchMock)

    let downloadedFileName = ""
    document.addEventListener(
      "click",
      event => {
        if (event.target instanceof HTMLAnchorElement) {
          event.preventDefault()
          downloadedFileName = event.target.download
        }
      },
      { once: true },
    )

    await downloadRosterExport({ tourSessionId: "session-1", classId: "class-1" })

    const call = fetchMock.mock.calls[0]
    expect(call).toBeDefined()
    if (call === undefined) {
      throw new Error("fetch was not called")
    }
    const headers = new Headers(call[1]?.headers)
    expect(call[0]).toBe("http://127.0.0.1:3000/roster/export.xlsx?tourSessionId=session-1&classId=class-1")
    expect(headers.get("x-linan-dev-staff-role")).toBe("administrator")
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(downloadedFileName).toBe("名单统计-session-1.xlsx")
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:roster")
  })

  it("converts roster API and network failures to readable Chinese messages", () => {
    expect(readableRosterError(new RosterApiError(403, "无权查看名单"))).toBe("无权查看名单")
    expect(readableRosterError(new TypeError("failed to fetch"))).toBe("无法连接服务器")
  })
})
