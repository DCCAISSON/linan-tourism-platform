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

export type OrderHistoryItem = OrderResponse & {
  readonly tourSessionId: string
  readonly activityTitle: string
  readonly schoolName: string
  readonly startsAt: string
  readonly endsAt: string
  readonly createdAt: string
}

export type OrderParticipant = {
  readonly id: string
  readonly enrollmentParticipantId: string
  readonly displayName: string
  readonly participantKind: "student" | "adult"
  readonly gradeName: string | null
  readonly className: string | null
  readonly amountFen: number
}

export type OrderDetailResponse = OrderHistoryItem & {
  readonly contactName: string
  readonly emergencyContactName: string | null
  readonly emergencyContactPhone: string | null
  readonly participants: readonly OrderParticipant[]
}

export type StaffOrderListResponse = {
  readonly orders: readonly OrderHistoryItem[]
  readonly total: number
  readonly page: number
  readonly pageSize: number
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
