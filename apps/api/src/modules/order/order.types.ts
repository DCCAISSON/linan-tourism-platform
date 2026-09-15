import type { OrderStatus, PaymentStatus } from "@linan/contracts"
export const LOCAL_MOCK_PROVIDER = "local_mock" as const

export type NewOrder = {
  readonly enrollmentId: string
  readonly payerName: string
  readonly requestIdempotencyKey: string
}

export type OrderResponse = {
  readonly id: string
  readonly code: string
  readonly enrollmentId: string
  readonly payerName: string
  readonly status: OrderStatus
  readonly amountFen: number
  readonly paidFen: number
  readonly participantCount: number
}

export type MockPaymentEventStatus = "succeeded" | "failed"

export type MockPaymentEvent = {
  readonly eventId: string
  readonly orderId: string
  readonly transactionId: string
  readonly amountFen: number
  readonly status: MockPaymentEventStatus
  readonly provider: string
}

export type MockPaymentResponse = {
  readonly id: string
  readonly orderId: string
  readonly paymentNo: string
  readonly provider: typeof LOCAL_MOCK_PROVIDER
  readonly status: PaymentStatus
  readonly amountFen: number
}
