import {
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
} from "typeorm"
import { OrganizationEntity } from "./organization.entity.js"
import { RosterImportBatchEntity } from "./roster-import-batch.entity.js"
import { SchoolClassEntity } from "./school-class.entity.js"
import { SchoolGradeEntity } from "./school-grade.entity.js"
import { TourSessionEntity } from "./tour-session.entity.js"

@Entity({ name: "roster_import_people" })
@Index("uq_roster_import_people_session_identity", ["tourSessionId", "identityHash"], { unique: true })
@Index("idx_roster_import_people_batch", ["batchId"])
@Index("idx_roster_import_people_scope", ["organizationId", "gradeId", "classId"])
export class RosterImportPersonEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => RosterImportBatchEntity, { name: "fk_roster_import_people_batch", onDelete: "CASCADE", onUpdate: "CASCADE" })
  @Column({ name: "batch_id", type: "varchar", length: 64 })
  batchId = ""

  @ForeignKey(() => OrganizationEntity, { name: "fk_roster_import_people_organization", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "organization_id", type: "varchar", length: 64 })
  organizationId = ""

  @ForeignKey(() => TourSessionEntity, { name: "fk_roster_import_people_tour_session", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "tour_session_id", type: "varchar", length: 64 })
  tourSessionId = ""

  @ForeignKey(() => SchoolGradeEntity, { name: "fk_roster_import_people_grade", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "grade_id", type: "varchar", length: 64, nullable: true })
  gradeId: string | null = null

  @ForeignKey(() => SchoolClassEntity, { name: "fk_roster_import_people_class", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "class_id", type: "varchar", length: 64, nullable: true })
  classId: string | null = null

  @Column({ name: "source_row_number", type: "int", unsigned: true })
  sourceRowNumber = 0

  @Column({ name: "source_class_name", type: "varchar", length: 120 })
  sourceClassName = ""

  @Column({ type: "varchar", length: 16 })
  role: "student" | "guardian" | "teacher" = "student"

  @Column({ name: "display_name", type: "varchar", length: 120 })
  displayName = ""

  @Column({ name: "identity_ciphertext", type: "text" })
  identityCiphertext = ""

  @Column({ name: "identity_hash", type: "char", length: 64 })
  identityHash = ""

  @Column({ name: "identity_masked", type: "varchar", length: 64 })
  identityMasked = ""

  @Column({ name: "phone_ciphertext", type: "text", nullable: true })
  phoneCiphertext: string | null = null

  @Column({ name: "phone_hash", type: "char", length: 64, nullable: true })
  phoneHash: string | null = null

  @Column({ name: "phone_masked", type: "varchar", length: 32, nullable: true })
  phoneMasked: string | null = null

  @Column({ name: "person_data_key_version", type: "varchar", length: 16 })
  personDataKeyVersion = "v1"

  @Column({ name: "created_by", type: "varchar", length: 64 })
  createdBy = ""

  @Column({ type: "varchar", length: 16, default: "active" })
  status: "active" | "disabled" = "active"

  @Column({ type: "int", unsigned: true, default: 1 })
  version = 1

  @Column({ name: "eligibility_status", type: "varchar", length: 16, default: "pending" })
  eligibilityStatus: "pending" | "confirmed" = "pending"

  @Column({ name: "eligibility_reason", type: "varchar", length: 500, nullable: true })
  eligibilityReason: string | null = null

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)
}
