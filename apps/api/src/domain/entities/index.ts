import { AuditLogEntity } from "./audit-log.entity.js"
import { CatalogItemEntity } from "./catalog-item.entity.js"
import { ConsentRecordEntity } from "./consent-record.entity.js"
import { EnrollmentEntity } from "./enrollment.entity.js"
import { OrderEntity } from "./order.entity.js"
import { OrganizationEntity } from "./organization.entity.js"
import { PaymentEntity } from "./payment.entity.js"
import { RosterEntryEntity } from "./roster-entry.entity.js"
import { TourSessionEntity } from "./tour-session.entity.js"

export { AuditLogEntity } from "./audit-log.entity.js"
export { CatalogItemEntity } from "./catalog-item.entity.js"
export { ConsentRecordEntity } from "./consent-record.entity.js"
export { EnrollmentEntity } from "./enrollment.entity.js"
export { OrderEntity } from "./order.entity.js"
export { OrganizationEntity } from "./organization.entity.js"
export { PaymentEntity } from "./payment.entity.js"
export { RosterEntryEntity } from "./roster-entry.entity.js"
export { TourSessionEntity } from "./tour-session.entity.js"

export const DOMAIN_ENTITIES = [
  OrganizationEntity,
  CatalogItemEntity,
  TourSessionEntity,
  EnrollmentEntity,
  OrderEntity,
  PaymentEntity,
  RosterEntryEntity,
  ConsentRecordEntity,
  AuditLogEntity,
]
