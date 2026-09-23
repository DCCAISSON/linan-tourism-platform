import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"
import { EvaluationStandardEntity } from "./evaluation-standard.entity.js"
import { StaffAccountEntity } from "./staff-account.entity.js"
import { TourSessionEntity } from "./tour-session.entity.js"

@Entity({ name: "student_evaluations" })
@Index("uq_student_evaluations_person", ["tourSessionId", "personRef"], { unique: true })
@Index("idx_student_evaluations_school", ["organizationId", "confirmedAt"])
export class StudentEvaluationEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => TourSessionEntity, { name: "fk_student_evaluations_session", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "tour_session_id", type: "varchar", length: 64 })
  tourSessionId = ""

  @Column({ name: "organization_id", type: "varchar", length: 64 })
  organizationId = ""

  @Column({ name: "person_ref", type: "varchar", length: 80 })
  personRef = ""

  @Column({ name: "display_name", type: "varchar", length: 120 })
  displayName = ""

  @Column({ name: "grade_name", type: "varchar", length: 120, nullable: true })
  gradeName: string | null = null

  @Column({ name: "class_name", type: "varchar", length: 120, nullable: true })
  className: string | null = null

  @ForeignKey(() => EvaluationStandardEntity, { name: "fk_student_evaluations_standard", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "standard_id", type: "varchar", length: 64, nullable: true })
  standardId: string | null = null

  @Column({ name: "standard_version", type: "int", unsigned: true, nullable: true })
  standardVersion: number | null = null

  @Column({ name: "grade_code", type: "varchar", length: 8, nullable: true })
  gradeCode: "A" | "B" | null = null

  @Column({ name: "grade_label", type: "varchar", length: 80, nullable: true })
  gradeLabel: string | null = null

  @Column({ name: "internal_comment", type: "varchar", length: 500 })
  internalComment = ""

  @Column({ type: "boolean", default: false })
  excellent = false

  @Column({ type: "boolean", default: false })
  attention = false

  @Column({ name: "idempotency_key", type: "varchar", length: 80 })
  idempotencyKey = ""

  @ForeignKey(() => StaffAccountEntity, { name: "fk_student_evaluations_author", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "updated_by_staff_id", type: "varchar", length: 64 })
  updatedByStaffId = ""

  @Column({ name: "confirmed_at", type: "datetime", precision: 6, nullable: true })
  confirmedAt: Date | null = null

  @Column({ name: "confirmed_by_staff_id", type: "varchar", length: 64, nullable: true })
  confirmedByStaffId: string | null = null

  @Column({ type: "int", unsigned: true, default: 1 })
  version = 1

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
