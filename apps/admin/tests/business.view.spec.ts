import { createApp, h } from "vue"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useBusinessView } from "@/views/business/useBusinessView"

const inquiry = {
  id: "inquiry-1", productId: "product-1", organizationId: "org-1", customerType: "individual", organizationName: "",
  contactName: "咨询联系人", phone: "138****0000", request: "咨询行程", status: "inquiry", ownerStaffAccountId: null,
  version: 1, createdAt: "2026-09-27T00:00:00Z", updatedAt: "2026-09-27T00:00:00Z",
} as const
const history = [{ id: "followup-1", ownerDisplayName: "业务负责人", status: "processing", note: "已联系", createdAt: "2026-09-27T01:00:00Z" }]
const apps: ReturnType<typeof createApp>[] = []
const pricedProduct = {
  id: "product-1", organizationId: "org-1", category: "tourism", title: "已有价格的产品", offering: "一日行程", content: "产品介绍",
  referencePriceFen: 12800, customerServicePhone: "", bookingUrl: "", bookingAuthorized: false, media: [], mediaAuthorized: false,
  status: "draft", version: 1, createdAt: "2026-09-27T00:00:00Z", updatedAt: "2026-09-27T00:00:00Z",
} as const

function mountView(permissions: readonly string[]) {
  let version = 1
  const savedHistory = [...history]
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (init?.method === "POST" && url.endsWith("/followups")) {
      version += 1
      savedHistory.push({ ...history[0], id: "followup-2", ownerDisplayName: "业务负责人", status: "processing", note: "第二次联系", createdAt: "2026-09-27T02:00:00Z" })
      return Response.json({ id: "followup-2", version })
    }
    if (url.endsWith("/staff/auth/me")) return Response.json({ actorId: "operator", kind: "staff", forcePasswordChange: false, permissionKeys: permissions, scopes: [{ kind: "organization", id: "org-1" }] })
    if (url.endsWith("/inquiries/inquiry-1/owners")) return Response.json([{ id: "staff-1", displayName: "业务负责人" }])
    if (url.endsWith("/inquiries/inquiry-1")) return Response.json({ ...inquiry, version, phone: "13800000000", productTitle: "旅游产品", ownerDisplayName: "未分派", history: savedHistory })
    if (url.endsWith("/inquiries")) return Response.json([inquiry])
    if (url.endsWith("/organizations")) return Response.json([{ id: "org-1", name: "本机构" }])
    return Response.json([])
  })
  vi.stubGlobal("fetch", fetchMock)
  let view: ReturnType<typeof useBusinessView> | undefined
  const app = createApp({ setup() { view = useBusinessView(); return () => h("div") } })
  const host = document.createElement("div")
  document.body.append(host)
  app.mount(host)
  apps.push(app)
  if (view === undefined) throw new Error("View did not mount")
  return { view, fetchMock }
}

describe("business staff workflow", () => {
  afterEach(() => { apps.splice(0).forEach(app => app.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals() })

  it("loads the audited contact and history when selecting a masked inquiry", async () => {
    // Given a scoped business operator and a masked list row.
    const { view } = mountView(["business.read", "business.followup"])
    await vi.waitFor(() => expect(view.inquiries.value).toHaveLength(1))
    // When the operator opens the inquiry.
    await view.selectInquiry(inquiry)
    // Then the detail contains the contact and retained history, while the list stays masked.
    expect(view.selectedInquiry.value).toMatchObject({ phone: "13800000000", history })
    expect(view.inquiries.value[0]?.phone).toBe("138****0000")
    expect(view.owners.value).toEqual([{ id: "staff-1", displayName: "业务负责人" }])
  })

  it("enables content maintenance when the current staff has business write permission", async () => {
    // Given a business editor.
    const { view } = mountView(["business.read", "business.write"])
    // When current permissions finish loading.
    // Then content maintenance is enabled from those permissions.
    await vi.waitFor(() => expect(view.canWrite.value).toBe(true))
  })

  it("does not request product administration when only inquiry followup is allowed", async () => {
    // Given a followup-only operator.
    const { view, fetchMock } = mountView(["business.followup"])
    // When initial inquiries load.
    await vi.waitFor(() => expect(view.inquiries.value).toHaveLength(1))
    // Then the inaccessible product list is not requested.
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/staff/products"))).toBe(false)
    expect(view.canWrite.value).toBe(false)
  })

  it("reloads the selected detail and complete history after saving followup", async () => {
    const { view } = mountView(["business.followup"])
    await vi.waitFor(() => expect(view.inquiries.value).toHaveLength(1))
    await view.selectInquiry(inquiry)
    view.followup.ownerStaffAccountId = "staff-1"
    view.followup.note = "第二次联系"

    await view.saveFollowup()

    expect(view.selectedInquiry.value?.version).toBe(2)
    expect(view.selectedInquiry.value?.history.map(row => row.note)).toEqual(["已联系", "第二次联系"])
    expect(view.followup.note).toBe("")
  })

  it("clears prior contact details and reports failure when the next detail is denied", async () => {
    const { view, fetchMock } = mountView(["business.followup"])
    await vi.waitFor(() => expect(view.inquiries.value).toHaveLength(1))
    await view.selectInquiry(inquiry)
    fetchMock.mockImplementation(async () => Response.json({ message: "无权访问该机构业务" }, { status: 403 }))

    await view.selectInquiry({ id: "other-inquiry" })

    expect(view.selectedInquiry.value).toBeUndefined()
    expect(view.followupError.value).toBe("无权访问该机构业务")
    expect(view.detailLoading.value).toBe(false)
  })

  it("keeps the draft note and shows the conflict when another operator has updated the inquiry", async () => {
    const { view, fetchMock } = mountView(["business.followup"])
    await vi.waitFor(() => expect(view.inquiries.value).toHaveLength(1))
    await view.selectInquiry(inquiry)
    view.followup.note = "尚未保存的联系内容"
    fetchMock.mockImplementation(async () => Response.json({ message: "咨询已变更，请刷新后跟进" }, { status: 409 }))

    await view.saveFollowup()

    expect(view.followup.note).toBe("尚未保存的联系内容")
    expect(view.followupError.value).toContain("请刷新后跟进")
    expect(view.followupMessage.value).toBe("")
  })

  it.each(["abc", "NaN", "Infinity", "-1", "12.345", "1e2", "1000000.01"])("rejects invalid price %s without sending or clearing an existing price", async price => {
    const { view, fetchMock } = mountView(["business.read", "business.write"])
    await vi.waitFor(() => expect(view.accessLoading.value).toBe(false))
    view.selectProduct(pricedProduct)
    view.priceYuan.value = price
    fetchMock.mockClear()

    await view.saveProduct()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(view.priceYuan.value).toBe(price)
    expect(view.form.referencePriceFen).toBe(12800)
    expect(view.productError.value).toContain("参考价格")
    expect(view.productBusy.value).toBe(false)
  })

  it.each([["", null], ["   ", null], ["0", 0], ["1.13", 113], ["128.5", 12850], ["1000000", 100000000]] as const)("sends price %s as %s integer fen or explicit empty value", async (price, expectedFen) => {
    const { view, fetchMock } = mountView(["business.read", "business.write"])
    await vi.waitFor(() => expect(view.accessLoading.value).toBe(false))
    view.selectProduct(pricedProduct)
    view.priceYuan.value = price
    fetchMock.mockClear()
    fetchMock.mockImplementation(async (_input, init) => Response.json(init?.method === "PUT" ? { ...pricedProduct, referencePriceFen: expectedFen, version: 2 } : []))

    await view.saveProduct()

    const update = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")
    expect(update?.[1]?.body).toBe(JSON.stringify({ ...view.form, referencePriceFen: expectedFen, media: [], expectedVersion: 1 }))
    expect(view.productError.value).toBe("")
  })
})
