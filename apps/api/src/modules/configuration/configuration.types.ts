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
  readonly status: string
  readonly policyVersion: string
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
  readonly policyVersion: string
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
