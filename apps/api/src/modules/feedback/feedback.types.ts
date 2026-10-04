export type ServiceFeedbackSource = "family" | "school"
export type ServiceFeedbackStatus = "submitted" | "published" | "rejected"
export type FeedbackFilters = {
  readonly source?: ServiceFeedbackSource
  readonly status?: ServiceFeedbackStatus
  readonly rating?: number
}
export type ServiceFeedbackInput = {
  readonly tourSessionId: string
  readonly orderId: string | null
  readonly source: ServiceFeedbackSource
  readonly rating: number
  readonly content: string
  readonly contactName: string
  readonly allowPublic: boolean
  readonly idempotencyKey: string
}
export type FeedbackReviewInput = {
  readonly expectedVersion: number
  readonly status: "published" | "rejected"
  readonly publicExcerpt: string
}
export type ServiceFeedbackRecord = {
  readonly id: string
  readonly tourSessionId: string
  readonly organizationId: string
  readonly source: ServiceFeedbackSource
  readonly rating: number
  readonly content: string
  readonly allowPublic: boolean
  readonly status: ServiceFeedbackStatus
  readonly publicExcerpt: string
  readonly version: number
}
export type FeedbackSummary = {
  readonly totalCount: number
  readonly publicCount: number
  readonly averageRating: number
}
export type PublicFeedbackItem = {
  readonly id: string
  readonly source: ServiceFeedbackSource
  readonly rating: number
  readonly publicExcerpt: string
}
