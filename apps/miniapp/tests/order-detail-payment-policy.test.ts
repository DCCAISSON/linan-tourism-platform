import { describe, expect, it } from "vitest"
import { decidePendingPaymentAction, paymentCapabilitiesClosed, type PaymentCapabilities, wechatPaymentFailureMessage } from "../src/payment-policy"

const capabilitiesOpen: PaymentCapabilities = {
  wechatPaymentEnabled: true,
  wechatRefundEnabled: true,
  paymentReconciliationEnabled: true,
}

describe("order detail payment policy", () => {
  it("keeps a pending order pending when the server disables WeChat payment", () => {
    const action = decidePendingPaymentAction({
      paying: false,
      capabilities: paymentCapabilitiesClosed,
    })

    expect(action.canStartWechatPayment).toBe(false)
    expect(action.disabled).toBe(true)
    expect(action.buttonText).toBe("微信支付暂未开放")
    expect(action.notice).toBe("微信支付暂未开放，请联系工作人员处理。")
    expect(action.resultingOrderStatus).toBe("pending_payment")
  })

  it("uses the live server capability as the payment switch", () => {
    expect(decidePendingPaymentAction({ paying: false, capabilities: paymentCapabilitiesClosed }).canStartWechatPayment).toBe(false)
    expect(decidePendingPaymentAction({ paying: false, capabilities: capabilitiesOpen }).canStartWechatPayment).toBe(true)
  })

  it("does not expose any local payment action or successful payment result", () => {
    const action = decidePendingPaymentAction({
      paying: false,
      capabilities: paymentCapabilitiesClosed,
    })

    expect(Object.values(action).join(" ")).not.toMatch(/mock|模拟|local_mock|支付成功|已支付/)
  })

  it("keeps the order payable when the user closes the WeChat cashier", () => {
    expect(wechatPaymentFailureMessage({ errMsg: "requestPayment:fail cancel" })).toBe("已取消支付，订单仍为待支付，可稍后继续付款。")
  })

  it("uses the normal failure message for non-cancellation errors", () => {
    expect(wechatPaymentFailureMessage({ errMsg: "requestPayment:fail system error" })).toBe("暂时无法确认支付结果，请查看订单状态。")
  })
})
