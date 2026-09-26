import { describe, expect, it } from "vitest"
import { decidePendingPaymentAction, paymentCapabilitiesClosed, type PaymentCapabilities } from "../src/payment-policy"

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
      buildWechatPaymentEnabled: true,
    })

    expect(action.canStartWechatPayment).toBe(false)
    expect(action.disabled).toBe(true)
    expect(action.buttonText).toBe("微信支付暂未开放")
    expect(action.notice).toBe("微信支付暂未开放，请联系工作人员处理。")
    expect(action.resultingOrderStatus).toBe("pending_payment")
  })

  it("treats the build flag only as a local upper bound", () => {
    expect(decidePendingPaymentAction({ paying: false, capabilities: capabilitiesOpen, buildWechatPaymentEnabled: false }).canStartWechatPayment).toBe(false)
    expect(decidePendingPaymentAction({ paying: false, capabilities: capabilitiesOpen, buildWechatPaymentEnabled: true }).canStartWechatPayment).toBe(true)
  })

  it("does not expose any local payment action or successful payment result", () => {
    const action = decidePendingPaymentAction({
      paying: false,
      capabilities: paymentCapabilitiesClosed,
      buildWechatPaymentEnabled: true,
    })

    expect(Object.values(action).join(" ")).not.toMatch(/mock|模拟|local_mock|支付成功|已支付/)
  })
})
