import type { ApplicationStatus } from "./refund-application.policy.js"

export type RefundApplicationLineResponse = {
  readonly lineId: string
  readonly displayName: string
  readonly amountFen: number
}

export type RefundApplicationResponse = {
  readonly id: string
  readonly orderId: string
  readonly status: ApplicationStatus
  readonly reason: string
  readonly amountFen: number
  readonly lines: readonly RefundApplicationLineResponse[]
  readonly submittedAt: string
  readonly updatedAt: string
  readonly reviewReason: string | null
  readonly reviewedAt: string | null
  readonly refundRequestId: string | null
  readonly refundStatus: "pending" | "succeeded" | "failed" | null
}
