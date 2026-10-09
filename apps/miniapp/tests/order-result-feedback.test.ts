import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { compileScript, parse } from "vue/compiler-sfc"
import { ModuleKind, transpileModule } from "typescript"
import * as vue from "vue"
import { beforeEach, describe, expect, it, vi } from "vitest"
import * as paymentPolicy from "../src/payment-policy"

type Page = {
  orderId: vue.Ref<string>
  order: vue.Ref<unknown>
  selectedLineIds: vue.Ref<readonly string[]>
  reason: vue.Ref<string>
  error: vue.Ref<string>
  load: () => Promise<unknown>
  pay: () => Promise<void>
  cancelPayment: () => Promise<void>
  submit: () => Promise<void>
  openRefund: () => void
  openInsurance: () => void
}
const pending = { id: "order", status: "pending_payment", paidFen: 0, amountFen: 200, participants: [] }
const paid = { ...pending, status: "paid", paidFen: 200 }
const api = {
  getOrderDetail: vi.fn(async () => pending),
  getCapabilities: vi.fn(async () => ({ wechatPaymentEnabled: true })),
  createWechatPayment: vi.fn(async () => ({ miniappPayment: {} })),
  cancelOrder: vi.fn(async () => ({ ...pending, status: "cancelled" })),
}
const contracts = { getContract: vi.fn<() => Promise<{ status: string } | null>>(async () => null) }
const refunds = {
  listRefundApplications: vi.fn(async () => []),
  submitRefundApplication: vi.fn(async () => ({})),
}
const modal = vi.fn()
const navigateTo = vi.fn()
const showToast = vi.fn()
let sessionToken = "token-a"
const requestPayment = vi.fn((options: { success: () => void; fail: (cause: unknown) => void }) => options.success())

function setup(name: "detail" | "refund"): Page {
  const { descriptor } = parse(readFileSync(new URL(`../src/pages/orders/${name}.vue`, import.meta.url), "utf8"))
  const compiled = compileScript(descriptor, { id: name })
  const code = transpileModule(compiled.content, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
  const exports: Record<string, unknown> = {}
  runInNewContext(code, {
    exports,
    uni: { showModal: modal, showToast, pageScrollTo: vi.fn(), navigateTo, requestPayment, login: (options: { success: (result: { code: string }) => void }) => options.success({ code: "test" }) },
    require: (module: string) => {
      if (module === "vue") return vue
      if (module === "@dcloudio/uni-app") return { onLoad: vi.fn(), onShow: vi.fn() }
      if (module.endsWith("contract-api")) return { createContractApi: () => contracts }
      if (module.endsWith("wechat-token")) return { getEnrollmentDraftOwner: () => "owner-a", getWechatSessionToken: () => sessionToken }
      if (module.endsWith("/api")) return { createMiniappApi: () => api }
      if (module.endsWith("refund-applications-api")) return { createRefundApplicationClient: () => refunds, activeRefundApplicationLineIds: () => new Set<string>() }
      if (module.endsWith("payment-policy")) return paymentPolicy
      if (module.endsWith("enrollment-flow")) return { formatFen: (amount: number) => `¥${(amount / 100).toFixed(2)}` }
      if (module.endsWith("page-helpers")) return { readableError: (_cause: unknown, fallback: string) => fallback }
      return {}
    },
  })
  const page = (exports["default"] as { setup: (props: object, context: object) => Page }).setup({}, { expose: vi.fn() })
  page.orderId.value = "order"
  return page
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionToken = "token-a"
  modal.mockReset().mockImplementation((options: { success?: (result: { confirm: boolean }) => void }) => options.success?.({ confirm: true }))
  api.cancelOrder.mockReset().mockResolvedValue({ ...pending, status: "cancelled" })
  api.getOrderDetail.mockReset().mockResolvedValue(pending)
  contracts.getContract.mockReset().mockResolvedValue(null)
  refunds.listRefundApplications.mockResolvedValue([])
  refunds.submitRefundApplication.mockResolvedValue({})
  requestPayment.mockImplementation((options) => options.success())
})

describe("order result feedback", () => {
  it("opens this order's insurance without starting payment or changing the order", async () => {
    const page = setup("detail")
    await page.load()
    page.order.value = { ...pending, id: "order/1" }
    page.openInsurance()
    expect(navigateTo).toHaveBeenCalledWith({ url: "/pages/orders/insurance?orderId=order%2F1" })
    expect(api.createWechatPayment).not.toHaveBeenCalled()
    expect(page.order.value).toMatchObject({ status: "pending_payment" })
  })
  it("shows the authoritative cancelled result without depending on another request", async () => {
    const page = setup("detail")
    await page.load()
    api.getOrderDetail.mockRejectedValueOnce(new Error("offline after cancellation"))
    await page.cancelPayment()
    expect(modal).toHaveBeenCalledWith(expect.objectContaining({ title: "取消支付？", confirmText: "取消支付", cancelText: "继续保留" }))
    expect(api.cancelOrder).toHaveBeenCalledOnce()
    expect(page.order.value).toMatchObject({ status: "cancelled" })
    expect(api.getOrderDetail).toHaveBeenCalledOnce()
    expect(showToast).toHaveBeenCalledWith({ title: "订单已取消", icon: "none" })
  })

  it("keeps the pending order when cancellation is not confirmed", async () => {
    modal.mockImplementationOnce((options: { success: (result: { confirm: boolean }) => void }) => options.success({ confirm: false }))
    const page = setup("detail")
    await page.load()
    await page.cancelPayment()
    expect(api.cancelOrder).not.toHaveBeenCalled()
    expect(page.order.value).toMatchObject({ status: "pending_payment" })
  })

  it("does not let a refresh overwrite a cancellation while it is pending", async () => {
    let finishCancel: (value: typeof pending) => void = () => { throw new Error("Cancellation not started") }
    api.cancelOrder.mockImplementationOnce(() => new Promise(resolve => { finishCancel = resolve }))
    const page = setup("detail")
    await page.load()
    const cancelling = page.cancelPayment()
    await vi.waitFor(() => expect(api.cancelOrder).toHaveBeenCalledOnce())
    await page.load()
    expect(api.getOrderDetail).toHaveBeenCalledOnce()
    finishCancel({ ...pending, status: "cancelled" })
    await cancelling
    expect(page.order.value).toMatchObject({ status: "cancelled" })
  })

  it("does not claim cancellation when the service fails or payment is already complete", async () => {
    const page = setup("detail")
    await page.load()
    api.cancelOrder.mockRejectedValueOnce(new Error("payment result unknown"))
    await page.cancelPayment()
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ title: "取消未完成，请刷新订单状态后重试。" }))
    expect(page.order.value).toMatchObject({ status: "pending_payment" })
    page.order.value = paid
    await page.cancelPayment()
    expect(api.cancelOrder).toHaveBeenCalledOnce()
  })

  it("does not cancel under a new session after confirmation", async () => {
    modal.mockImplementationOnce((options: { success: (result: { confirm: boolean }) => void }) => { sessionToken = "token-b"; options.success({ confirm: true }) })
    const page = setup("detail")
    await page.load()
    await page.cancelPayment()
    expect(api.cancelOrder).not.toHaveBeenCalled()
    expect(showToast).not.toHaveBeenCalled()
  })

  it("routes unsigned contracts to handwriting without calling payment", async () => {
    contracts.getContract.mockResolvedValue({ status: "pending_parent_signature" })
    const page = setup("detail")
    await page.load(); await page.pay()
    expect(api.createWechatPayment).not.toHaveBeenCalled()
    expect(navigateTo).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining("/pages/orders/contract?") }))
  })
  it("does not call payment when contract refresh fails", async () => {
    const page = setup("detail")
    await page.load(); contracts.getContract.mockRejectedValueOnce(new Error("offline")); await page.pay()
    expect(api.createWechatPayment).not.toHaveBeenCalled()
    expect(page.error.value).toBe("合同加载失败，请重试后继续付款。")
  })
  it("allows the existing payment after the parent's signature is saved", async () => {
    contracts.getContract.mockResolvedValue({ status: "parent_signed_pending_agency" })
    const page = setup("detail")
    await page.load(); await page.pay()
    expect(api.createWechatPayment).toHaveBeenCalledOnce()
  })
  it("shows payment success only after the refreshed order is paid", async () => {
    const page = setup("detail")
    await page.load()
    expect(modal).not.toHaveBeenCalled()
    api.getOrderDetail.mockResolvedValue(paid)
    await page.pay()
    expect(modal).toHaveBeenCalledWith(expect.objectContaining({ title: "支付成功", content: expect.stringContaining("¥2.00"), showCancel: false }))
  })

  it.each(["pending", "refresh-failure"])("does not claim payment success for %s", async (mode) => {
    const page = setup("detail")
    await page.load()
    if (mode === "refresh-failure") api.getOrderDetail.mockRejectedValueOnce(new Error("offline"))
    await page.pay()
    expect(modal).toHaveBeenCalledWith(expect.objectContaining({ title: "支付结果确认中", content: expect.stringContaining("请勿重复付款") }))
  })

  it("does not show success after cancelling WeChat payment", async () => {
    const page = setup("detail")
    await page.load()
    requestPayment.mockImplementationOnce((options) => options.fail({ errMsg: "requestPayment:fail cancel" }))
    await page.pay()
    expect(modal).not.toHaveBeenCalled()
    expect(page.error.value).toBe(paymentPolicy.paymentCancelledNotice)
  })

  it.each([false, true])("acknowledges accepted refund even if refresh fails: %s", async (refreshFails) => {
    const page = setup("refund")
    page.selectedLineIds.value = ["line"]
    page.reason.value = "无法参加"
    if (refreshFails) api.getOrderDetail.mockRejectedValueOnce(new Error("offline"))
    await page.submit()
    expect(modal).toHaveBeenCalledWith(expect.objectContaining({ title: "退款申请已提交", content: expect.stringContaining("等待工作人员审核"), confirmText: "我知道了" }))
  })

  it("does not acknowledge a rejected refund submission", async () => {
    const page = setup("refund")
    page.selectedLineIds.value = ["line"]
    refunds.submitRefundApplication.mockRejectedValueOnce(new Error("rejected"))
    await page.submit()
    expect(modal).not.toHaveBeenCalled()
    expect(page.error.value).toBe("退款申请提交失败")
  })

  it("allows opening refund history when no further refund can be requested", () => {
    const page = setup("detail")
    page.order.value = { ...paid, participants: [] }
    page.openRefund()
    expect(navigateTo).toHaveBeenCalledWith({ url: "/pages/orders/refund?orderId=order" })
  })
})
