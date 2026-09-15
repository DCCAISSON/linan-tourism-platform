import { AuditLogEntity } from "./audit-log.entity.js"
import { CatalogItemEntity } from "./catalog-item.entity.js"
import { ConsentRecordEntity } from "./consent-record.entity.js"
import { EnrollmentEntity } from "./enrollment.entity.js"
import { EnrollmentParticipantEntity } from "./enrollment-participant.entity.js"
import { FamilyEntity } from "./family.entity.js"
import { FamilyMemberEntity } from "./family-member.entity.js"
import { OrderEntity } from "./order.entity.js"
import { OrderLineEntity } from "./order-line.entity.js"
import { OrganizationEntity } from "./organization.entity.js"
import { PaymentEntity } from "./payment.entity.js"
import { PaymentEventEntity } from "./payment-event.entity.js"
import { RosterEntryEntity } from "./roster-entry.entity.js"
import { SchoolClassEntity } from "./school-class.entity.js"
import { SchoolGradeEntity } from "./school-grade.entity.js"
import { TourSessionEntity } from "./tour-session.entity.js"

export { AuditLogEntity } from "./audit-log.entity.js"
export { CatalogItemEntity } from "./catalog-item.entity.js"
export { ConsentRecordEntity } from "./consent-record.entity.js"
export { EnrollmentEntity } from "./enrollment.entity.js"
export { EnrollmentParticipantEntity } from "./enrollment-participant.entity.js"
export { FamilyEntity } from "./family.entity.js"
export { FamilyMemberEntity } from "./family-member.entity.js"
export { OrderEntity } from "./order.entity.js"
export { OrderLineEntity } from "./order-line.entity.js"
export { OrganizationEntity } from "./organization.entity.js"
export { PaymentEntity } from "./payment.entity.js"
export { PaymentEventEntity } from "./payment-event.entity.js"
export { RosterEntryEntity } from "./roster-entry.entity.js"
export { SchoolClassEntity } from "./school-class.entity.js"
export { SchoolGradeEntity } from "./school-grade.entity.js"
export { TourSessionEntity } from "./tour-session.entity.js"

export const DOMAIN_ENTITIES = [
  OrganizationEntity,
  FamilyEntity,
  SchoolGradeEntity,
  SchoolClassEntity,
  FamilyMemberEntity,
  CatalogItemEntity,
  TourSessionEntity,
  EnrollmentEntity,
  EnrollmentParticipantEntity,
  OrderEntity,
  OrderLineEntity,
  PaymentEntity,
  PaymentEventEntity,
  RosterEntryEntity,
  ConsentRecordEntity,
  AuditLogEntity,
]
