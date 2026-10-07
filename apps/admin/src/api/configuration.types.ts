export type School = {
  readonly id: string
  readonly name: string
  readonly code: string
}

export type Grade = {
  readonly id: string
  readonly organizationId: string
  readonly schoolId: string
  readonly name: string
  readonly code: string
  readonly status: string
}

export type SchoolClass = {
  readonly id: string
  readonly gradeId: string
  readonly name: string
  readonly code: string
  readonly status: string
}

export type CatalogItem = {
  readonly id: string
  readonly organizationId: string
  readonly code: string
  readonly title: string
  readonly status: string
  readonly policyVersion: string
  readonly description: string
  readonly coverImageUrl: string
  readonly templateId?: string | null
}

export type CatalogTemplateContent = {
  readonly title: string
  readonly description: string
  readonly coverImageUrl: string
}

export type CatalogTemplate = CatalogTemplateContent & {
  readonly id: string
  readonly version: number
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

export type NoticeVersion = {
  readonly id: string
  readonly organizationId: string
  readonly tourSessionId: string
  readonly version: string
  readonly title: string
  readonly contentJson: NoticeContent
  readonly createdAt: string
}

export type EnrollmentScope = readonly { readonly gradeId: string; readonly classIds: readonly string[] | null }[] | null

export type TourSession = {
  readonly enrollmentScope?: EnrollmentScope
  readonly id: string
  readonly organizationId: string
  readonly catalogItemId: string
  readonly code: string
  readonly startsAt: string
  readonly endsAt: string
  readonly enrollmentOpensAt: string
  readonly enrollmentClosesAt: string
  readonly status: string
  readonly priceFen: number
  readonly capacity: number
  readonly minimumParticipants?: number | null
  readonly occupiedCapacity?: number | null
  readonly activeNoticeId: string | null
  readonly activeNotice: NoticeVersion | null
  readonly policyVersion: string
}

export type SchoolPayload = {
  readonly name: string
  readonly code: string
}

export type GradePayload = {
  readonly code: string
  readonly name: string
}

export type ClassPayload = {
  readonly code: string
  readonly name: string
}

export type CatalogItemPayload = {
  readonly organizationId: string
  readonly code: string
  readonly title: string
  readonly status: string
  readonly description?: string
  readonly coverImageUrl?: string
}

export type CatalogContentPayload = {
  readonly title?: string
  readonly status?: string
  readonly description: string
  readonly coverImageUrl: string
}

export type TourSessionPayload = {
  readonly enrollmentScope?: EnrollmentScope
  readonly organizationId: string
  readonly catalogItemId: string
  readonly code: string
  readonly startsAt: string
  readonly endsAt: string
  readonly enrollmentOpensAt: string
  readonly enrollmentClosesAt: string
  readonly status: string
  readonly priceFen: number
  readonly capacity: number
  readonly minimumParticipants?: number | null
}

export type TourSessionUpdatePayload = Partial<TourSessionPayload>

export type NoticeVersionPayload = {
  readonly version: string
  readonly title: string
  readonly contentJson: NoticeContent
}
