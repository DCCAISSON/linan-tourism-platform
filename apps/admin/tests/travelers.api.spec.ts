import { afterEach, describe, expect, it, vi } from "vitest"
import { confirmTravelerEligibility, downloadTravelersExport, getTravelers } from "@/api/travelers"

describe("travelers API", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("requests unified travelers with staff session cookies and parses counts", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify(responseBody()), {
      headers: { "Content-Type": "application/json" },
    }))
    vi.stubGlobal("fetch", fetchMock)

    const result = await getTravelers("session-1", { includeInactive: true, source: "imported" })

    const call = fetchMock.mock.calls[0]
    expect(call).toBeDefined()
    if (call === undefined) throw new Error("fetch was not called")
    expect(call[0]).toBe("http://127.0.0.1:3000/travelers/sessions/session-1?source=imported&includeInactive=true")
    expect(call[1]?.credentials).toBe("include")
    expect(result.activeCount).toBe(1)
    expect(result.travelers[0]?.sourceRefs).toEqual(["paid:line-1", "imported:import-1"])
  })

  it("posts eligibility confirmation with roster and import versions", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify(responseBody()), {
      headers: { "Content-Type": "application/json" },
    }))
    vi.stubGlobal("fetch", fetchMock)

    await confirmTravelerEligibility("import-1", {
      expectedVersion: 1,
      expectedRosterVersion: "a".repeat(64),
      reason: "学校确认随队参加",
    })

    const call = fetchMock.mock.calls[0]
    expect(call).toBeDefined()
    if (call === undefined) throw new Error("fetch was not called")
    expect(call[0]).toBe("http://127.0.0.1:3000/travelers/imports/import-1/confirm")
    expect(call[1]?.method).toBe("POST")
    expect(call[1]?.credentials).toBe("include")
    expect(call[1]?.body).toBe(JSON.stringify({
      expectedVersion: 1,
      expectedRosterVersion: "a".repeat(64),
      reason: "学校确认随队参加",
    }))
  })

  it("downloads the unified travelers workbook", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response("xlsx", {
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    }))
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:travelers")
    const revokeObjectURL = vi.fn<(url: string) => void>()
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL })
    vi.stubGlobal("fetch", fetchMock)
    let downloadedFileName = ""
    document.addEventListener("click", event => {
      if (event.target instanceof HTMLAnchorElement) {
        event.preventDefault()
        downloadedFileName = event.target.download
      }
    }, { once: true })

    await downloadTravelersExport("session-1", { includeInactive: true })

    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:3000/travelers/sessions/session-1/export.xlsx?includeInactive=true")
    expect(downloadedFileName).toBe("出行名单-session-1.xlsx")
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:travelers")
  })
})

function responseBody(): unknown {
  return {
    tourSessionId: "session-1",
    organizationId: "school-1",
    rosterVersion: "a".repeat(64),
    activeCount: 1,
    inactiveCount: 0,
    conflictCount: 0,
    total: 1,
    page: 1,
    pageSize: 50,
    travelers: [{
      personRef: "paid:line-1",
      sourceRefs: ["paid:line-1", "imported:import-1"],
      source: "paid",
      tourSessionId: "session-1",
      organizationId: "school-1",
      displayName: "测试学生",
      gradeId: "grade-1",
      classId: "class-1",
      gradeName: "三年级",
      className: "一班",
      participantKind: "student",
      importedRole: null,
      identityMasked: "330100********1234",
      phoneMasked: "138****1234",
      active: true,
      inactiveReason: null,
      eligibility: "paid",
      eligibilityReason: null,
      importVersion: null,
      conflict: null,
    }],
  }
}
