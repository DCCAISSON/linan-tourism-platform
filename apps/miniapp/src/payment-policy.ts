import type { OrderStatus } from "@linan/contracts"

export type PaymentCapabilities = {
  readonly wechatPaymentEnabled: boolean
  readonly wechatRefundEnabled: boolean
  readonly paymentReconciliationEnabled: boolean
}

export type PendingPaymentActionInput = {
  readonly paying: boolean
  readonly capabilities: PaymentCapabilities
}

export type PendingPaymentAction = {
  readonly canStartWechatPayment: boolean
  readonly disabled: boolean
  readonly buttonText: string
  readonly notice: string
  readonly resultingOrderStatus: OrderStatus
}

export const paymentCapabilitiesClosed: PaymentCapabilities = {
  wechatPaymentEnabled: false,
  wechatRefundEnabled: false,
  paymentReconciliationEnabled: false,
}

export const paymentUnavailableNotice = "微信支付暂未开放，请联系工作人员处理。" as const
export const paymentCancelledNotice = "已取消支付，订单仍为待支付，可稍后继续付款。" as const

export function wechatPaymentFailureMessage(cause: unknown): string {
  if (typeof cause === "object" && cause !== null && "errMsg" in cause) {
    const message = cause.errMsg
    if (typeof message === "string" && message.toLowerCase().includes("cancel")) return paymentCancelledNotice
  }
  return "暂时无法确认支付结果，请查看订单状态。"
}

export function canUseWechatPayment(input: Pick<PendingPaymentActionInput, "capabilities">): boolean {
  return input.capabilities.wechatPaymentEnabled
}

export function decidePendingPaymentAction(input: PendingPaymentActionInput): PendingPaymentAction {
  const canStartWechatPayment = canUseWechatPayment(input)
  if (input.paying) {
    return {
      canStartWechatPayment,
      disabled: true,
      buttonText: "正在打开微信支付",
      notice: "正在打开微信支付页面，请稍候。",
      resultingOrderStatus: "pending_payment",
    }
  }
  if (canStartWechatPayment) {
    return {
      canStartWechatPayment,
      disabled: false,
      buttonText: "去微信支付",
      notice: "请在微信支付页面完成付款，并确认订单状态。",
      resultingOrderStatus: "pending_payment",
    }
  }
  return {
    canStartWechatPayment: false,
    disabled: true,
    buttonText: "微信支付暂未开放",
    notice: paymentUnavailableNotice,
    resultingOrderStatus: "pending_payment",
  }
}
