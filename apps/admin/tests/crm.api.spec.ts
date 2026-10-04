import { afterEach, describe, expect, it, vi } from "vitest"

import {
  createCrmCustomer,
  createCrmFollowup,
  downloadCrmExport,
  getCrmDetail,
  getCrmHistory,
  listCrmCustomers,
  readableCrmError,
  CrmApiError,
} from "@/api/crm"

describe("crm API", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("lists adult CRM customers with filters and staff cookies", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response(JSON.stringify({ customers: [], total: 0, page: 1, pageSize: 20 }), { headers: { "Content-Type": "application/json" } }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await listCrmCustomers({ organizationId: "school-1", tag: "亲子游", page: 1 })

    const call = fetchMock.mock.calls[0]
    expect(call).toBeDefined()
    if (call === undefined) {
      throw new Error("fetch was not called")
    }
    expect(call[0]).toBe("http://127.0.0.1:3000/staff/crm/contacts?organizationId=school-1&tag=%E4%BA%B2%E5%AD%90%E6%B8%B8&page=1")
    expect(call[1]?.credentials).toBe("include")
    expect(result.total).toBe(0)
  })

  it("creates customers, followups, detail, and history through the staff CRM surface", async () => {
    const customer = {
      id: "crm-1",
      organizationId: "school-1",
      displayName: "合成成人",
      phoneMasked: "138****0000",
      source: "主动咨询",
      tags: ["亲子游"],
      marketingConsent: "unknown",
      ownerId: null,
      familyId: "family-1",
      nextFollowupAt: null,
      version: 1,
      createdAt: "2026-09-23T00:00:00.000Z",
      updatedAt: "2026-09-23T00:00:00.000Z",
    }
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async (input) => {
      const url = String(input)
      if (url.endsWith("/staff/crm/contacts/crm-1/history")) {
        return new Response(JSON.stringify([{ orderId: "order-1", code: "ORD-1", status: "paid", paidFen: 1200, participantCount: 2, activityTitle: "山水课堂", startsAt: "2026-10-01T00:00:00.000Z" }]), { headers: { "Content-Type": "application/json" } })
      }
      if (url.endsWith("/staff/crm/contacts/crm-1/followups")) {
        return new Response(JSON.stringify({ id: "crf-1" }), { headers: { "Content-Type": "application/json" } })
      }
      return new Response(JSON.stringify({ ...customer, followups: [] }), { headers: { "Content-Type": "application/json" } })
    })
    vi.stubGlobal("fetch", fetchMock)

    const created = await createCrmCustomer({
      organizationId: "school-1",
      displayName: "合成成人",
      birthDate: "1990-01-01",
      adultConfirmed: true,
      phone: "13800000000",
      source: "主动咨询",
      tags: ["亲子游"],
      marketingConsent: "unknown",
      ownerId: null,
      familyId: "family-1",
      idempotencyKey: "crm-create-1",
    })
    const detail = await getCrmDetail("crm-1")
    const followup = await createCrmFollowup("crm-1", { content: "电话确认家庭行程", nextFollowupAt: null, idempotencyKey: "crm-follow-1" })
    const history = await getCrmHistory("crm-1")

    expect(created.displayName).toBe("合成成人")
    expect(detail.followups).toEqual([])
    expect(followup.id).toBe("crf-1")
    expect(history[0]?.code).toBe("ORD-1")
  })

  it("downloads a masked CRM export with the same query", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response("客户姓名,脱敏电话", { headers: { "Content-Type": "text/csv; charset=utf-8" } }),
    )
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:crm")
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

    await downloadCrmExport({ organizationId: "school-1", keyword: "合成", page: 1 })

    const call = fetchMock.mock.calls[0]
    expect(call).toBeDefined()
    if (call === undefined) {
      throw new Error("fetch was not called")
    }
    expect(call[0]).toBe("http://127.0.0.1:3000/staff/crm/export.csv?organizationId=school-1&keyword=%E5%90%88%E6%88%90&page=1")
    expect(call[1]?.credentials).toBe("include")
    expect(downloadedFileName).toBe("成人CRM-school-1.csv")
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:crm")
  })

  it("converts CRM API and network failures to readable messages", () => {
    expect(readableCrmError(new CrmApiError(403, "无权查看成人CRM"))).toBe("无权查看成人CRM")
    expect(readableCrmError(new TypeError("failed to fetch"))).toBe("无法连接服务器")
  })
})
