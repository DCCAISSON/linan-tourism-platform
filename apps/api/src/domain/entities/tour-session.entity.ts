import { NoticeVersionEntity } from "./notice-version.entity.js"
import {
  DOMAIN_POLICY_VERSION,
  TOUR_SESSION_STATUS,
  type TourSessionStatus,
} from "@linan/contracts"
import {
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm"
import { CatalogItemEntity } from "./catalog-item.entity.js"
import { OrganizationEntity } from "./organization.entity.js"
import type { InsurancePlan } from "../../modules/insurance/insurance.types.js"

@Index("idx_tour_sessions_active_notice", ["activeNoticeId"])
@Entity({ name: "tour_sessions" })
@Index("uq_tour_sessions_org_code", ["organizationId", "code"], { unique: true })
@Index("idx_tour_sessions_catalog_item", ["catalogItemId"])
export class TourSessionEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => OrganizationEntity, {
    name: "fk_tour_sessions_organization",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "organization_id", type: "varchar", length: 64 })
  organizationId = ""

  @ForeignKey(() => CatalogItemEntity, {
    name: "fk_tour_sessions_catalog_item",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "catalog_item_id", type: "varchar", length: 64 })
  catalogItemId = ""

  @Column({ type: "varchar", length: 64 })
  code = ""

  @Column({ type: "varchar", length: 32 })
  status: TourSessionStatus = TOUR_SESSION_STATUS.draft

  @Column({ name: "price_fen", type: "int", unsigned: true })
  priceFen = 0

  @Column({ type: "int", unsigned: true })
  capacity = 0

  @Column({ name: "minimum_participants", type: "int", unsigned: true, nullable: true })
  minimumParticipants: number | null = null

  @Column({ name: "insurance_plan_json", type: "json", nullable: true })
  insurancePlanJson: InsurancePlan | null = null

  @Column({ name: "starts_at", type: "datetime", precision: 6 })
  startsAt = new Date(0)

  @Column({ name: "ends_at", type: "datetime", precision: 6 })
  endsAt = new Date(0)

  @Column({ name: "enrollment_opens_at", type: "datetime", precision: 6, nullable: true })
  enrollmentOpensAt: Date | null = null

  @Column({ name: "enrollment_closes_at", type: "datetime", precision: 6, nullable: true })
  enrollmentClosesAt: Date | null = null

  @Column({ name: "enrollment_scope_json", type: "json", nullable: true })
  enrollmentScopeJson: import("../../modules/configuration/configuration.scope.js").EnrollmentScope = null

  @ForeignKey(() => NoticeVersionEntity, { name: "fk_tour_sessions_active_notice", onDelete: "SET NULL", onUpdate: "CASCADE" })
  @Column({ name: "active_notice_id", type: "varchar", length: 64, nullable: true })
  activeNoticeId: string | null = null

  @Column({ name: "active_contract_template_id", type: "varchar", length: 64, nullable: true })
  activeContractTemplateId: string | null = null

  @Column({ name: "policy_version", type: "varchar", length: 64 })
  policyVersion = DOMAIN_POLICY_VERSION

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
