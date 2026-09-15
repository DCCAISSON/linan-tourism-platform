import type { CreateOrderPayload, Order, TourSession } from "./api"
import type { PageMode } from "./enrollment-flow"

export type TripGate =
  | { readonly open: true }
  | { readonly open: false; readonly reason: string }

export function buildCreateOrderPayload(
  enrollmentId: string,
  payerName: string,
  requestIdempotencyKey: string,
): CreateOrderPayload {
  return {
    enrollmentId,
    payerName: payerName.trim(),
    requestIdempotencyKey,
  }
}

export function readTripGate(session: TourSession | undefined, nowIso: string): TripGate {
  if (session === undefined) {
    return { open: false, reason: "请选择团期" }
  }

  switch (session.status) {
    case "published":
      return readPublishedTripGate(session, nowIso)
    case "draft":
      return { open: false, reason: "团期尚未开放" }
    case "closed":
      return { open: false, reason: "报名已关闭" }
    case "cancelled":
      return { open: false, reason: "团期已取消" }
    default:
      return assertNever(session.status)
  }
}

export function nextPageModeForOrder(order: Order): PageMode {
  switch (order.status) {
    case "paid":
      return "paid"
    case "pending_payment":
      return "paymentPending"
    case "cancelled":
    case "refunded":
      return "paymentPending"
    default:
      return assertNever(order.status)
  }
}

export function orderStatusLabel(order: Order | null): string {
  if (order === null) {
    return "待创建订单"
  }

  switch (order.status) {
    case "pending_payment":
      return "待支付"
    case "paid":
      return "已支付"
    case "cancelled":
      return "订单已取消"
    case "refunded":
      return "订单已退款"
    default:
      return assertNever(order.status)
  }
}

export function canStartPayment(order: Order | null): order is Order & { readonly status: "pending_payment" } {
  return order?.status === "pending_payment"
}

export function createOrderRequestKey(enrollmentId: string): string {
  return `order-${enrollmentId}`
}

function readPublishedTripGate(session: TourSession, nowIso: string): TripGate {
  const now = new Date(nowIso).getTime()
  const opensAt = new Date(session.enrollmentOpensAt).getTime()
  const closesAt = new Date(session.enrollmentClosesAt).getTime()
  if (Number.isNaN(now) || Number.isNaN(opensAt) || Number.isNaN(closesAt)) {
    return { open: false, reason: "团期时间异常" }
  }
  if (now < opensAt) {
    return { open: false, reason: "报名尚未开始" }
  }
  if (now > closesAt) {
    return { open: false, reason: "报名已截止" }
  }
  return { open: true }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected checkout state: ${value}`)
}
