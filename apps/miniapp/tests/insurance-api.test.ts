import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "../src/api-error"
import { createInsuranceApi } from "../src/insurance-api"
import { familyInsurance, insuranceRecord } from "./insurance-fixture"

const storage = new Map<string, unknown>()
beforeEach(() => {
  storage.clear()
  storage.set("linan_wechat_session_token", "session-a")
  vi.stubGlobal("uni", { getStorageSync: (key: string) => storage.get(key), removeStorageSync: (key: string) => storage.delete(key) })
})

describe("family insurance API", () => {
  it("requests the scoped order with the current family identity", async () => {
    const request = vi.fn(async () => ({ statusCode: 200, data: { ...familyInsurance, orderId: "order/1" } }))
    const api = createInsuranceApi({ baseUrl: "https://fixture.invalid/", request })
    storage.set("linan_wechat_session_token", "session-b")
    await api.getInsurance("order/1")
    expect(request).toHaveBeenCalledWith({ url: "https://fixture.invalid/orders/order%2F1/insurance", method: "GET", header: { Authorization: "Bearer session-b" } })
  })

  it("preserves current and historical plans separately and strips unrelated private fields", async () => {
    const oldRecord = { ...insuranceRecord, batchId: "batch-1", planSnapshot: null }
    const request = async () => ({ statusCode: 200, data: { ...familyInsurance, identityCiphertext: "private", people: [{ ...familyInsurance.people[0], phoneCiphertext: "private", records: [{ ...insuranceRecord, receiptReference: "internal" }, oldRecord] }] } })
    const result = await createInsuranceApi({ request }).getInsurance("order-1")
    expect(result).toEqual({ ...familyInsurance, people: [{ ...familyInsurance.people[0], records: [insuranceRecord, oldRecord] }] })
  })

  it("keeps empty plans and records as successful responses", async () => {
    const data = { ...familyInsurance, currentPlan: null, people: [{ ...familyInsurance.people[0], records: [] }] }
    await expect(createInsuranceApi({ request: async () => ({ statusCode: 200, data }) }).getInsurance("order-1")).resolves.toEqual(data)
  })

  it("does not request private records without a family identity", async () => {
    storage.clear()
    const request = vi.fn()
    await expect(createInsuranceApi({ request }).getInsurance("order-1")).rejects.toMatchObject({ statusCode: 401 })
    expect(request).not.toHaveBeenCalled()
  })

  it("rejects a response for another order", async () => {
    await expect(createInsuranceApi({ request: async () => ({ statusCode: 200, data: familyInsurance }) }).getInsurance("other-order")).rejects.toThrow("当前订单")
  })

  it.each([
    { status: "active" }, { batchStatus: "cancelled" }, { coverageStart: "2026-02-30" }, { coverageEnd: "not-a-date" },
    { coverageStart: "2026-10-14", coverageEnd: "2026-10-13" }, { coverageStart: "2026-10-12T00:00:00Z" },
    { createdAt: "invalid" }, { submittedAt: "invalid" }, { policyNumber: 123 },
  ])("rejects malformed insurance records %j", async (patch) => {
    const data = { ...familyInsurance, people: [{ ...familyInsurance.people[0], records: [{ ...insuranceRecord, ...patch }] }] }
    await expect(createInsuranceApi({ request: async () => ({ statusCode: 200, data }) }).getInsurance("order-1")).rejects.toBeInstanceOf(ApiError)
  })

  it("rejects an unsupported refund status without implying cancellation of insurance", async () => {
    const data = { ...familyInsurance, people: [{ ...familyInsurance.people[0], refundStatus: "cancelled" }] }
    await expect(createInsuranceApi({ request: async () => ({ statusCode: 200, data }) }).getInsurance("order-1")).rejects.toBeInstanceOf(ApiError)
  })

  it.each([401, 404, 500])("keeps a %s response distinct from empty insurance records", async (statusCode) => {
    await expect(createInsuranceApi({ request: async () => ({ statusCode, data: {} }) }).getInsurance("order-1")).rejects.toMatchObject({ statusCode })
    expect(storage.has("linan_wechat_session_token")).toBe(statusCode !== 401)
  })

  it("does not erase a newer login when an earlier request returns 401", async () => {
    const request = async () => {
      storage.set("linan_wechat_session_token", "session-b")
      return { statusCode: 401, data: {} }
    }
    await expect(createInsuranceApi({ request }).getInsurance("order-1")).rejects.toMatchObject({ statusCode: 401 })
    expect(storage.get("linan_wechat_session_token")).toBe("session-b")
  })

  it("reports a network failure without returning an empty result", async () => {
    await expect(createInsuranceApi({ request: async () => { throw new Error("network offline") } }).getInsurance("order-1")).rejects.toMatchObject({ statusCode: 0 })
  })
})
