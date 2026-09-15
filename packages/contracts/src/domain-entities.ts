import type {
  AuditLogId,
  CatalogItemId,
  CnyFen,
  ConsentRecordId,
  EnrollmentId,
  EnrollmentStatus,
  OrderId,
  OrderStatus,
  OrganizationId,
  PaymentId,
  PaymentStatus,
  RosterEntryId,
  RosterStatus,
  SchoolClassId,
  SchoolGradeId,
  TourSessionId,
  TourSessionStatus,
} from "./index.js"

export type OrganizationContract = {
  readonly id: OrganizationId
  readonly code: string
  readonly name: string
}

export type SchoolGradeContract = {
  readonly id: SchoolGradeId
  readonly organizationId: OrganizationId
  readonly code: string
  readonly name: string
}

export type SchoolClassContract = {
  readonly id: SchoolClassId
  readonly gradeId: SchoolGradeId
  readonly code: string
  readonly name: string
}

export type CatalogItemContract = {
  readonly id: CatalogItemId
  readonly organizationId: OrganizationId
  readonly code: string
  readonly title: string
  readonly status: "active"
  readonly policyVersion: string
}

export type TourSessionContract = {
  readonly id: TourSessionId
  readonly organizationId: OrganizationId
  readonly catalogItemId: CatalogItemId
  readonly code: string
  readonly status: TourSessionStatus
  readonly priceFen: CnyFen
  readonly capacity: number
  readonly startsAt: Date
  readonly endsAt: Date
  readonly enrollmentOpensAt: Date | null
  readonly enrollmentClosesAt: Date | null
  readonly policyVersion: string
}

export type EnrollmentContract = {
  readonly id: EnrollmentId
  readonly organizationId: OrganizationId
  readonly tourSessionId: TourSessionId
  readonly code: string
  readonly contactName: string
  readonly participantCount: number
  readonly status: EnrollmentStatus
  readonly policyVersion: string
}

export type OrderContract = {
  readonly id: OrderId
  readonly organizationId: OrganizationId
  readonly enrollmentId: EnrollmentId
  readonly code: string
  readonly requestIdempotencyKey: string
  readonly payerName: string
  readonly status: OrderStatus
  readonly amountFen: CnyFen
  readonly paidFen: CnyFen
  readonly policyVersion: string
}

export type PaymentContract = {
  readonly id: PaymentId
  readonly organizationId: OrganizationId
  readonly orderId: OrderId
  readonly paymentNo: string
  readonly providerTransactionId: string | null
  readonly providerEventId: string | null
  readonly status: PaymentStatus
  readonly amountFen: CnyFen
  readonly channel: string
  readonly policyVersion: string
}

export type RosterEntryContract = {
  readonly id: RosterEntryId
  readonly organizationId: OrganizationId
  readonly tourSessionId: TourSessionId
  readonly enrollmentId: EnrollmentId
  readonly displayName: string
  readonly credentialHash: string
  readonly status: RosterStatus
  readonly policyVersion: string
}

export type ConsentRecordContract = {
  readonly id: ConsentRecordId
  readonly organizationId: OrganizationId
  readonly subjectId: EnrollmentId
  readonly purpose: string
  readonly granted: boolean
  readonly agreementVersion: string
  readonly schemaVersion: string
  readonly acceptedAt: Date
  readonly revokedAt: Date | null
  readonly policyVersion: string
}

export type AuditLogContract = {
  readonly id: AuditLogId
  readonly organizationId: OrganizationId
  readonly actorId: string
  readonly action: string
  readonly targetType: string
  readonly targetId: string
  readonly policyVersion: string
}
