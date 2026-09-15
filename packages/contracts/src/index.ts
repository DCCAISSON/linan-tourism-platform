export const HEALTH_STATUS = {
  ok: "ok",
} as const

export type HealthStatus = (typeof HEALTH_STATUS)[keyof typeof HEALTH_STATUS]

export type HealthResponse = {
  readonly status: HealthStatus
  readonly service: "@linan/api"
}

export type {
  AuditLogContract,
  CatalogItemContract,
  ConsentRecordContract,
  EnrollmentContract,
  EnrollmentParticipantContract,
  FamilyContract,
  FamilyMemberContract,
  OrderContract,
  OrderLineContract,
  OrganizationContract,
  PaymentContract,
  PaymentEventContract,
  RosterEntryContract,
  SchoolClassContract,
  SchoolGradeContract,
  TourSessionContract,
} from "./domain-entities.js"

export const DOMAIN_POLICY_VERSION = "provisional-domain-policy-v1" as const
export const DOMAIN_SCHEMA_VERSION = "provisional-domain-schema-v1" as const
export const FAMILY_ENROLLMENT_AGREEMENT_VERSION = "family-enrollment-agreement-v1" as const

export const DOMAIN_ENTITY_KIND = {
  organization: "organization",
  family: "family",
  familyMember: "family_member",
  schoolGrade: "school_grade",
  schoolClass: "school_class",
  enrollmentParticipant: "enrollment_participant",
  catalogItem: "catalog_item",
  tourSession: "tour_session",
  enrollment: "enrollment",
  order: "order",
  orderLine: "order_line",
  payment: "payment",
  paymentEvent: "payment_event",
  rosterEntry: "roster_entry",
  consentRecord: "consent_record",
  auditLog: "audit_log",
} as const

export type DomainEntityKind = (typeof DOMAIN_ENTITY_KIND)[keyof typeof DOMAIN_ENTITY_KIND]

export type DomainEntityId<Kind extends DomainEntityKind> = {
  readonly kind: Kind
  readonly value: string
}

export type OrganizationId = DomainEntityId<typeof DOMAIN_ENTITY_KIND.organization>
export type FamilyId = DomainEntityId<typeof DOMAIN_ENTITY_KIND.family>
export type FamilyMemberId = DomainEntityId<typeof DOMAIN_ENTITY_KIND.familyMember>
export type SchoolGradeId = DomainEntityId<typeof DOMAIN_ENTITY_KIND.schoolGrade>
export type SchoolClassId = DomainEntityId<typeof DOMAIN_ENTITY_KIND.schoolClass>
export type EnrollmentParticipantId = DomainEntityId<typeof DOMAIN_ENTITY_KIND.enrollmentParticipant>
export type CatalogItemId = DomainEntityId<typeof DOMAIN_ENTITY_KIND.catalogItem>
export type TourSessionId = DomainEntityId<typeof DOMAIN_ENTITY_KIND.tourSession>
export type EnrollmentId = DomainEntityId<typeof DOMAIN_ENTITY_KIND.enrollment>
export type OrderId = DomainEntityId<typeof DOMAIN_ENTITY_KIND.order>
export type OrderLineId = DomainEntityId<typeof DOMAIN_ENTITY_KIND.orderLine>
export type PaymentId = DomainEntityId<typeof DOMAIN_ENTITY_KIND.payment>
export type PaymentEventId = DomainEntityId<typeof DOMAIN_ENTITY_KIND.paymentEvent>
export type RosterEntryId = DomainEntityId<typeof DOMAIN_ENTITY_KIND.rosterEntry>
export type ConsentRecordId = DomainEntityId<typeof DOMAIN_ENTITY_KIND.consentRecord>
export type AuditLogId = DomainEntityId<typeof DOMAIN_ENTITY_KIND.auditLog>

export const CURRENCY = {
  cny: "CNY",
} as const

export type Currency = (typeof CURRENCY)[keyof typeof CURRENCY]

export type CnyFen = {
  readonly amount: number
  readonly currency: typeof CURRENCY.cny
  readonly unit: "fen"
}

export const TOUR_SESSION_STATUS = {
  draft: "draft",
  published: "published",
  closed: "closed",
  cancelled: "cancelled",
} as const

export type TourSessionStatus = (typeof TOUR_SESSION_STATUS)[keyof typeof TOUR_SESSION_STATUS]

export const ENROLLMENT_STATUS = {
  pending: "pending",
  confirmed: "confirmed",
  cancelled: "cancelled",
} as const

export type EnrollmentStatus = (typeof ENROLLMENT_STATUS)[keyof typeof ENROLLMENT_STATUS]

export const ORDER_STATUS = {
  pendingPayment: "pending_payment",
  paid: "paid",
  cancelled: "cancelled",
  refunded: "refunded",
} as const

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS]

export const PAYMENT_STATUS = {
  pending: "pending",
  succeeded: "succeeded",
  failed: "failed",
  refunded: "refunded",
} as const

export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS]

export const ROSTER_STATUS = {
  pending: "pending",
  checkedIn: "checked_in",
  cancelled: "cancelled",
} as const

export type RosterStatus = (typeof ROSTER_STATUS)[keyof typeof ROSTER_STATUS]

export const CONSENT_STATUS = {
  granted: "granted",
  revoked: "revoked",
} as const

export type ConsentStatus = (typeof CONSENT_STATUS)[keyof typeof CONSENT_STATUS]

export const DOMAIN_ERROR_CODE = {
  invalidId: "invalid_id",
  invalidMoneyAmount: "invalid_money_amount",
  invalidStateTransition: "invalid_state_transition",
  duplicateBusinessKey: "duplicate_business_key",
  organizationMismatch: "organization_mismatch",
  provisionalPolicyViolation: "provisional_policy_violation",
} as const

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODE)[keyof typeof DOMAIN_ERROR_CODE]

export type DomainContractError = {
  readonly code: DomainErrorCode
  readonly message: string
  readonly policyVersion: typeof DOMAIN_POLICY_VERSION
}

export type Result<Value, Failure> =
  { readonly ok: true; readonly value: Value } | { readonly ok: false; readonly error: Failure }

export type DomainEntityContract = {
  readonly kind: DomainEntityKind
  readonly tableName: string
  readonly idPrefix: string
}

export const DOMAIN_ENTITY_CONTRACTS = [
  { kind: DOMAIN_ENTITY_KIND.organization, tableName: "organizations", idPrefix: "org" },
  { kind: DOMAIN_ENTITY_KIND.family, tableName: "families", idPrefix: "family" },
  { kind: DOMAIN_ENTITY_KIND.familyMember, tableName: "family_members", idPrefix: "member" },
  { kind: DOMAIN_ENTITY_KIND.schoolGrade, tableName: "school_grades", idPrefix: "grade" },
  { kind: DOMAIN_ENTITY_KIND.schoolClass, tableName: "school_classes", idPrefix: "class" },
  {
    kind: DOMAIN_ENTITY_KIND.enrollmentParticipant,
    tableName: "enrollment_participants",
    idPrefix: "participant",
  },
  { kind: DOMAIN_ENTITY_KIND.catalogItem, tableName: "catalog_items", idPrefix: "catalog" },
  { kind: DOMAIN_ENTITY_KIND.tourSession, tableName: "tour_sessions", idPrefix: "session" },
  { kind: DOMAIN_ENTITY_KIND.enrollment, tableName: "enrollments", idPrefix: "enrollment" },
  { kind: DOMAIN_ENTITY_KIND.order, tableName: "orders", idPrefix: "order" },
  { kind: DOMAIN_ENTITY_KIND.orderLine, tableName: "order_lines", idPrefix: "order-line" },
  { kind: DOMAIN_ENTITY_KIND.payment, tableName: "payments", idPrefix: "payment" },
  {
    kind: DOMAIN_ENTITY_KIND.paymentEvent,
    tableName: "payment_events",
    idPrefix: "payment-event",
  },
  { kind: DOMAIN_ENTITY_KIND.rosterEntry, tableName: "roster_entries", idPrefix: "roster" },
  { kind: DOMAIN_ENTITY_KIND.consentRecord, tableName: "consent_records", idPrefix: "consent" },
  { kind: DOMAIN_ENTITY_KIND.auditLog, tableName: "audit_logs", idPrefix: "audit" },
] as const satisfies readonly DomainEntityContract[]

export function makeCnyFen(amount: number): Result<CnyFen, DomainContractError> {
  if (!Number.isInteger(amount) || amount < 0) {
    return {
      ok: false,
      error: {
        code: DOMAIN_ERROR_CODE.invalidMoneyAmount,
        message: "money amount must be a non-negative integer number of fen",
        policyVersion: DOMAIN_POLICY_VERSION,
      },
    }
  }

  return {
    ok: true,
    value: {
      amount,
      currency: CURRENCY.cny,
      unit: "fen",
    },
  }
}

const ORDER_STATUS_TRANSITIONS = [
  { from: ORDER_STATUS.pendingPayment, to: ORDER_STATUS.paid },
  { from: ORDER_STATUS.pendingPayment, to: ORDER_STATUS.cancelled },
  { from: ORDER_STATUS.paid, to: ORDER_STATUS.refunded },
] as const

export function transitionOrderStatus(
  current: OrderStatus,
  next: OrderStatus,
): Result<OrderStatus, DomainContractError> {
  if (current === next) {
    return { ok: true, value: next }
  }

  const isAllowed = ORDER_STATUS_TRANSITIONS.some(
    (transition) => transition.from === current && transition.to === next,
  )

  if (isAllowed) {
    return { ok: true, value: next }
  }

  return {
    ok: false,
    error: {
      code: DOMAIN_ERROR_CODE.invalidStateTransition,
      message: `order status cannot move from ${current} to ${next}`,
      policyVersion: DOMAIN_POLICY_VERSION,
    },
  }
}

const PAYMENT_STATUS_TRANSITIONS = [
  { from: PAYMENT_STATUS.pending, to: PAYMENT_STATUS.succeeded },
  { from: PAYMENT_STATUS.pending, to: PAYMENT_STATUS.failed },
  { from: PAYMENT_STATUS.failed, to: PAYMENT_STATUS.succeeded },
  { from: PAYMENT_STATUS.succeeded, to: PAYMENT_STATUS.refunded },
] as const

export function transitionPaymentStatus(
  current: PaymentStatus,
  next: PaymentStatus,
): Result<PaymentStatus, DomainContractError> {
  if (current === next) {
    return { ok: true, value: next }
  }

  const isAllowed = PAYMENT_STATUS_TRANSITIONS.some(
    (transition) => transition.from === current && transition.to === next,
  )

  if (isAllowed) {
    return { ok: true, value: next }
  }

  return {
    ok: false,
    error: {
      code: DOMAIN_ERROR_CODE.invalidStateTransition,
      message: `payment status cannot move from ${current} to ${next}`,
      policyVersion: DOMAIN_POLICY_VERSION,
    },
  }
}
