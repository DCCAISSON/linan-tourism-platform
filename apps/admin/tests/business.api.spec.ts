// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { createBusinessProduct, followupBusinessInquiry, listBusinessInquiries, listBusinessProducts, listBusinessOwners, listBusinessOrganizations } from "@/api/business"

const product = {
  id: "business-1",
  organizationId: "org-1",
  category: "tourism",
  title: "天目山周末游",
  offering: "两日线路",
  content: "适合家庭与单位小团咨询。",
  referencePriceFen: 68000,
  customerServicePhone: "13968023156",
  bookingUrl: "",
  bookingAuthorized: false,
  media: [],
  mediaAuthorized: true,
  status: "published",
  version: 1,
  createdAt: "2026-09-23T00:00:00.000Z",
  updatedAt: "2026-09-23T00:00:00.000Z",
} as const

describe("business admin API client", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("requests owner names for the selected inquiry without using account administration", async () => {
    const fetchMock = vi.fn(async () => Response.json([{ id: "staff-1", displayName: "负责人甲" }]))
    vi.stubGlobal("fetch", fetchMock)

    await expect(listBusinessOwners("inquiry-1")).resolves.toEqual([{ id: "staff-1", displayName: "负责人甲" }])

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:3000/business/staff/inquiries/inquiry-1/owners", { method: "GET", credentials: "include" })
  })

  it("rejects owner options that do not have display names", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([{ id: "staff-1" }])))

    await expect(listBusinessOwners("inquiry-1")).rejects.toThrow("业务内容响应格式不正确")
  })

  it("loads scoped organization names for product maintenance", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([{ id: "org-1", name: "本机构" }])))

    await expect(listBusinessOrganizations()).resolves.toEqual([{ id: "org-1", name: "本机构" }])
  })

  it("reads maintained products without treating draft content as paid bookings", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([product])))

    await expect(listBusinessProducts()).resolves.toEqual([product])
  })

  it("rejects malformed product status before rendering it as a valid business state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([{ ...product, status: "paid" }])))

    await expect(listBusinessProducts()).rejects.toThrow("业务内容响应格式不正确")
  })

  it("sends authorized content fields without client-side booking or inventory claims", async () => {
    const fetchMock = vi.fn(async () => Response.json(product))
    vi.stubGlobal("fetch", fetchMock)
    const input = {
      organizationId: "org-1",
      category: "homestay",
      title: "太湖源民宿",
      offering: "山景房型",
      content: "展示房型与咨询入口。",
      referencePriceFen: null,
      customerServicePhone: "13968023156",
      bookingUrl: "",
      bookingAuthorized: false,
      media: [],
      mediaAuthorized: true,
      status: "draft",
    } as const

    await createBusinessProduct(input)

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:3000/business/staff/products", expect.objectContaining({
      method: "POST",
      credentials: "include",
      body: JSON.stringify(input),
    }))
    expect(JSON.stringify(input)).not.toMatch(/roomStock|payment|pms|ota|inventory/i)
  })

  it("keeps inquiry list phone masked and followup statuses limited", async () => {
    const inquiry = {
      id: "inquiry-1",
      productId: "business-1",
      organizationId: "org-1",
      customerType: "organization",
      organizationName: "示例单位",
      contactName: "章先生",
      phone: "139****3156",
      request: "咨询疗休养套餐",
      status: "inquiry",
      ownerStaffAccountId: null,
      version: 1,
      createdAt: "2026-09-23T00:00:00.000Z",
      updatedAt: "2026-09-23T00:00:00.000Z",
    } as const
    const fetchMock = vi.fn(async () => Response.json(fetchMock.mock.calls.length === 1 ? [inquiry] : { id: "followup-1", version: 2 }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(listBusinessInquiries()).resolves.toEqual([inquiry])
    await expect(followupBusinessInquiry("inquiry-1", {
      idempotencyKey: "followup-1",
      expectedVersion: 1,
      status: "processing",
      ownerStaffAccountId: "staff-1",
      note: "已电话联系，等待资料。",
    })).resolves.toEqual({ id: "followup-1", version: 2 })
  })
})
