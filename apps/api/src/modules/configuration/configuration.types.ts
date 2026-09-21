import type { TourSessionStatus } from "@linan/contracts"

export type SchoolResponse = {
  readonly id: string
  readonly code: string
  readonly name: string
}

export type GradeResponse = {
  readonly id: string
  readonly organizationId: string
  readonly code: string
  readonly name: string
}

export type ClassResponse = {
  readonly id: string
  readonly gradeId: string
  readonly code: string
  readonly name: string
}

export type CatalogItemResponse = {
  readonly id: string
  readonly organizationId: string
  readonly code: string
  readonly title: string
  readonly description: string
  readonly coverImageUrl: string
  readonly status: string
  readonly policyVersion: string
}

export type NoticeContent = {
  readonly destination: string
  readonly departurePlace: string
  readonly mealNote: string
  readonly itinerary: readonly string[]
  readonly unitPrices: readonly string[]
  readonly packageExamples: readonly string[]
  readonly reminders: readonly string[]
}

export type NoticeVersionResponse = {
  readonly id: string
  readonly organizationId: string
  readonly tourSessionId: string
  readonly version: string
  readonly title: string
  readonly contentJson: NoticeContent
  readonly createdAt: Date
}

export type TourSessionResponse = {
  readonly id: string
  readonly organizationId: string
  readonly catalogItemId: string
  readonly code: string
  readonly status: TourSessionStatus
  readonly priceFen: number
  readonly capacity: number
  readonly startsAt: Date
  readonly endsAt: Date
  readonly enrollmentOpensAt: Date
  readonly enrollmentClosesAt: Date
  readonly activeNoticeId: string | null
  readonly activeNotice: NoticeVersionResponse | null
  readonly policyVersion: string
}

export type NewNoticeVersion = {
  readonly version: string
  readonly title: string
  readonly contentJson: NoticeContent
}

export type EnrollmentAvailabilityResponse = {
  readonly available: true
  readonly tourSessionId: string
  readonly at: string
}

export type NewSchool = {
  readonly code: string
  readonly name: string
}

export type NewGrade = {
  readonly organizationId: string
  readonly code: string
  readonly name: string
}

export type NewClass = {
  readonly gradeId: string
  readonly code: string
  readonly name: string
}

export type NewCatalogItem = {
  readonly organizationId: string
  readonly code: string
  readonly title: string
  readonly description: string
  readonly coverImageUrl: string
  readonly status: string
}

export type NewTourSession = {
  readonly organizationId: string
  readonly catalogItemId: string
  readonly code: string
  readonly status: TourSessionStatus
  readonly priceFen: number
  readonly capacity: number
  readonly startsAt: Date
  readonly endsAt: Date
  readonly enrollmentOpensAt: Date
  readonly enrollmentClosesAt: Date
}

export type UpdateSchool = {
  readonly code: string | undefined
  readonly name: string | undefined
}

export type UpdateGrade = {
  readonly code: string | undefined
  readonly name: string | undefined
}

export type UpdateClass = {
  readonly code: string | undefined
  readonly name: string | undefined
}

export type UpdateCatalogItem = {
  readonly code: string | undefined
  readonly title: string | undefined
  readonly description: string | undefined
  readonly coverImageUrl: string | undefined
  readonly status: string | undefined
}

export type UpdateTourSession = {
  readonly catalogItemId: string | undefined
  readonly code: string | undefined
  readonly status: TourSessionStatus | undefined
  readonly priceFen: number | undefined
  readonly capacity: number | undefined
  readonly startsAt: Date | undefined
  readonly endsAt: Date | undefined
  readonly enrollmentOpensAt: Date | undefined
  readonly enrollmentClosesAt: Date | undefined
}
