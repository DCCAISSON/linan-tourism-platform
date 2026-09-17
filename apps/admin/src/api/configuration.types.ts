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
}

export type TourSession = {
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
  readonly description: string
  readonly coverImageUrl: string
}

export type TourSessionPayload = {
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
}

export type TourSessionUpdatePayload = Partial<TourSessionPayload>
