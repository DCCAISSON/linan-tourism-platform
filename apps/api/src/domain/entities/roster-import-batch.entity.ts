import { DOMAIN_POLICY_VERSION } from "@linan/contracts"
import {
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm"
import { OrganizationEntity } from "./organization.entity.js"
import { SchoolClassEntity } from "./school-class.entity.js"
import { SchoolGradeEntity } from "./school-grade.entity.js"
import { TourSessionEntity } from "./tour-session.entity.js"

@Entity({ name: "roster_import_batches" })
@Index("idx_roster_import_batches_session", ["tourSessionId"])
@Index("idx_roster_import_batches_organization", ["organizationId"])
export class RosterImportBatchEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => OrganizationEntity, { name: "fk_roster_import_batches_organization", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "organization_id", type: "varchar", length: 64 })
  organizationId = ""

  @ForeignKey(() => TourSessionEntity, { name: "fk_roster_import_batches_tour_session", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "tour_session_id", type: "varchar", length: 64 })
  tourSessionId = ""

  @ForeignKey(() => SchoolGradeEntity, { name: "fk_roster_import_batches_grade", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "grade_id", type: "varchar", length: 64, nullable: true })
  gradeId: string | null = null

  @ForeignKey(() => SchoolClassEntity, { name: "fk_roster_import_batches_class", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "class_id", type: "varchar", length: 64, nullable: true })
  classId: string | null = null

  @Column({ name: "source_template", type: "varchar", length: 32 })
  sourceTemplate = ""

  @Column({ name: "file_name", type: "varchar", length: 255 })
  fileName = ""

  @Column({ name: "created_by", type: "varchar", length: 64 })
  createdBy = ""

  @Column({ name: "total_rows", type: "int", unsigned: true })
  totalRows = 0

  @Column({ name: "imported_count", type: "int", unsigned: true })
  importedCount = 0

  @Column({ name: "duplicate_count", type: "int", unsigned: true })
  duplicateCount = 0

  @Column({ name: "error_count", type: "int", unsigned: true })
  errorCount = 0

  @Column({ name: "policy_version", type: "varchar", length: 64 })
  policyVersion = DOMAIN_POLICY_VERSION

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
