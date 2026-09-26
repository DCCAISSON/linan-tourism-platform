import type { OrderStatus } from "@linan/contracts"

export type PaymentCapabilities = {
  readonly wechatPaymentEnabled: boolean
  readonly wechatRefundEnabled: boolean
  readonly paymentReconciliationEnabled: boolean
}

export type PendingPaymentActionInput = {
  readonly paying: boolean
  readonly capabilities: PaymentCapabilities
  readonly buildWechatPaymentEnabled: boolean
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

export function canUseWechatPayment(input: Pick<PendingPaymentActionInput, "capabilities" | "buildWechatPaymentEnabled">): boolean {
  return input.buildWechatPaymentEnabled && input.capabilities.wechatPaymentEnabled
}

export function decidePendingPaymentAction(input: PendingPaymentActionInput): PendingPaymentAction {
  const canStartWechatPayment = canUseWechatPayment(input)
  if (input.paying) {
    return {
      canStartWechatPayment,
      disabled: true,
      buttonText: "微信支付发起中",
      notice: "正在调起微信支付，请按微信收银台结果确认订单状态。",
      resultingOrderStatus: "pending_payment",
    }
  }
  if (canStartWechatPayment) {
    return {
      canStartWechatPayment,
      disabled: false,
      buttonText: "发起微信支付",
      notice: "当前订单将通过微信支付发起付款，请按微信收银台结果确认订单状态。",
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
