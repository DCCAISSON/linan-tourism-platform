import { PAYMENT_STATUS, type PaymentStatus } from "@linan/contracts"
import type { MockPaymentEventStatus } from "./order.types.js"

export function reduceMockPaymentStatus(
  current: PaymentStatus,
  eventStatus: MockPaymentEventStatus,
): PaymentStatus {
  switch (current) {
    case PAYMENT_STATUS.pending:
    case PAYMENT_STATUS.failed:
      return eventStatus === "succeeded" ? PAYMENT_STATUS.succeeded : PAYMENT_STATUS.failed
    case PAYMENT_STATUS.succeeded:
      return PAYMENT_STATUS.succeeded
    case PAYMENT_STATUS.refunded:
      return PAYMENT_STATUS.refunded
    default:
      return assertNever(current)
  }
}

function assertNever(value: never): never {
  throw new TypeError(`unexpected payment status: ${String(value)}`)
}
