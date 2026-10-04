import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { effectScope, nextTick, type EffectScope } from "vue"
import { useEnrollmentPage } from "../src/pages/index/useEnrollmentPage"
import type { OrderContract } from "../src/contract-types"
import { pendingContract, signedContract } from "./contract-fixture"

const calls = vi.hoisted(() => ({
  getContract: vi.fn<() => Promise<OrderContract | null>>(),
  createWechatPayment: vi.fn(async () => ({ miniappPayment: {} })),
  token: "owner-a",
}))
vi.mock("vue", async original => ({ ...await original<typeof import("vue")>(), onMounted: () => {} }))
vi.mock("@dcloudio/uni-app", () => ({ onLoad: () => {}, onShow: () => {}, onHide: () => {}, onUnload: () => {} }))
vi.mock("../src/contract-api", () => ({ createContractApi: () => calls }))
vi.mock("../src/service-consent", () => ({ hasServiceConsent: () => true }))
vi.mock("../src/wechat-token", async original => ({ ...await original<typeof import("../src/wechat-token")>(), getWechatSessionToken: () => calls.token, getEnrollmentDraftOwner: () => `family:${calls.token}` }))
vi.mock("../src/api", async original => ({ ...await original<typeof import("../src/api")>(), createMiniappApi: () => ({
  checkEnrollmentAvailability: async () => {}, submitEnrollment: async () => ({ id: "enrollment-1" }),
  createOrder: async () => ({ id: "order-1", code: "ORDER", enrollmentId: "enrollment-1", status: "pending_payment", amountFen: 100, paidFen: 0, payerName: "家长", participantCount: 1 }),
  createWechatPayment: calls.createWechatPayment,
  getOrder: async () => ({ id: "order-1", code: "ORDER", status: "pending_payment", amountFen: 100, paidFen: 0, payerName: "家长", participantCount: 1 }),
}) }))
const scopes: EffectScope[] = []
beforeEach(() => {
  calls.token = "owner-a"; calls.getContract.mockReset().mockResolvedValue(pendingContract); calls.createWechatPayment.mockClear()
  vi.stubGlobal("uni", { getStorageSync: () => undefined, removeStorageSync: () => {}, setStorageSync: () => {}, login: (input: { success: (value: { code: string }) => void }) => input.success({ code: "code" }), requestPayment: (input: { success: () => void }) => input.success() })
})
afterEach(() => { for (const scope of scopes) scope.stop(); scopes.length = 0; vi.unstubAllGlobals() })
function page() {
  const scope = effectScope(); scopes.push(scope)
  const state = scope.run(useEnrollmentPage)
  if (!state) throw new Error("No page")
  state.paymentCapabilities.value = { wechatPaymentEnabled: true, wechatRefundEnabled: false, paymentReconciliationEnabled: false }
  state.order.value = { id: "order-1", code: "ORDER", enrollmentId: "enrollment-1", status: "pending_payment", amountFen: 100, paidFen: 0, payerName: "家长", participantCount: 1 }
  state.pageMode.value = "paymentPending"
  return state
}
describe("enrollment contract gate", () => {
  it("does not start payment before signing", async () => {
    const state = page(); await state.startPayment()
    expect(calls.createWechatPayment).not.toHaveBeenCalled(); expect(state.contractPending.value).toBe(true)
  })
  it.each([null, signedContract])("continues existing payment for null or saved signed contracts", async contract => {
    calls.getContract.mockResolvedValue(contract)
    await page().startPayment()
    expect(calls.createWechatPayment).toHaveBeenCalledOnce()
  })
  it("does not allow payment when contract lookup fails", async () => {
    calls.getContract.mockRejectedValue(new Error("offline"))
    const state = page(); await state.startPayment()
    expect(calls.createWechatPayment).not.toHaveBeenCalled(); expect(state.contractState.value).toBe("error")
  })
  it("ignores contract lookup and payment after an account change", async () => {
    let resolve: (value: OrderContract | null) => void = () => {}
    calls.getContract.mockReturnValueOnce(new Promise(done => { resolve = done }))
    const state = page(); const request = state.startPayment(); calls.token = "owner-b"; resolve(null); await request
    expect(calls.createWechatPayment).not.toHaveBeenCalled(); expect(state.contract.value).toBeNull()
  })
  it("keeps a newly created unsigned order at the contract step", async () => {
    const state = page(); state.order.value = null
    state.catalog.sessions = [{ id: "trip", organizationId: "school", catalogItemId: "activity", code: "trip", status: "published", priceFen: 100, capacity: 30, startsAt: "2099-01-01T00:00:00Z", endsAt: "2099-01-02T00:00:00Z", enrollmentOpensAt: "2020-01-01T00:00:00Z", enrollmentClosesAt: "2098-12-31T00:00:00Z", activeNoticeId: null, activeNotice: null, policyVersion: "2026-09-15" }]
    const session = state.catalog.sessions[0]
    if (session) state.catalog.sessions = [{ ...session, activeNotice: { id: "notice", organizationId: "school", tourSessionId: "trip", version: "v1", title: "告知书", createdAt: "2026-10-03T00:00:00Z", contentJson: { destination: "临安", departurePlace: "学校", mealNote: "含午餐", itinerary: ["集合"], unitPrices: ["一元"], packageExamples: [], reminders: ["按时集合"] } } }]
    Object.assign(state.draft, { selectedSchoolId: "school", selectedTourSessionId: "trip", contactName: "家长", contactPhone: "19900003099", familyMembers: [{ id: "saved", remoteMemberId: "saved", fromCommonList: true, code: "saved", displayName: "学生", selected: true }] })
    await nextTick(); state.draft.agreementAccepted = true; await nextTick()
    state.authenticated.value = true; state.phoneVerified.value = true; state.pageMode.value = "review"
    await state.submitEnrollment()
    expect(state.order.value).toMatchObject({ id: "order-1" }); expect(state.contractPending.value).toBe(true)
    expect(calls.createWechatPayment).not.toHaveBeenCalled()
  })
})
