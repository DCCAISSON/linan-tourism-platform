import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"
import { OrganizationEntity } from "./organization.entity.js"
import { TourSessionEntity } from "./tour-session.entity.js"
import type { InsuranceBatchStatus } from "../../modules/insurance/insurance.types.js"

@Entity({ name: "insurance_batches" })
@Index("idx_insurance_batches_session", ["tourSessionId", "createdAt"])
@Index("idx_insurance_batches_roster_version", ["tourSessionId", "rosterVersion"])
export class InsuranceBatchEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => OrganizationEntity, { name: "fk_insurance_batches_organization", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "organization_id", type: "varchar", length: 64 })
  organizationId = ""

  @ForeignKey(() => TourSessionEntity, { name: "fk_insurance_batches_tour_session", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "tour_session_id", type: "varchar", length: 64 })
  tourSessionId = ""

  @Column({ name: "roster_version", type: "varchar", length: 64 })
  rosterVersion = ""

  @Column({ type: "varchar", length: 32 })
  status: InsuranceBatchStatus = "draft"

  @Column({ name: "company_template_name", type: "varchar", length: 120, nullable: true })
  companyTemplateName: string | null = null

  @Column({ name: "submitted_at", type: "datetime", precision: 6, nullable: true })
  submittedAt: Date | null = null

  @Column({ name: "created_by", type: "varchar", length: 64 })
  createdBy = ""

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
