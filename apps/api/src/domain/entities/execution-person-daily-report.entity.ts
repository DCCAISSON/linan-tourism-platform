import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"
import type { PersonRef } from "../../modules/travelers/travelers.types.js"
import { TourSessionEntity } from "./tour-session.entity.js"
import { StaffAccountEntity } from "./staff-account.entity.js"

@Entity({ name: "execution_person_daily_reports" })
@Index("uq_execution_person_daily_day", ["tourSessionId", "personRef", "reportDate"], { unique: true })
export class ExecutionPersonDailyReportEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""
  @ForeignKey(() => TourSessionEntity, { name: "fk_execution_person_daily_session", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "tour_session_id", type: "varchar", length: 64 })
  tourSessionId = ""
  @Column({ name: "person_ref", type: "varchar", length: 128 })
  personRef: PersonRef = "paid:"
  @Column({ name: "report_date", type: "varchar", length: 10 })
  reportDate = ""
  @Column({ name: "lodging_check", type: "text" })
  lodgingCheck = ""
  @Column({ name: "meal_status", type: "text" })
  mealStatus = ""
  @Column({ name: "encrypted_body_status", type: "text" })
  encryptedBodyStatus = ""
  @Column({ name: "encrypted_note", type: "text" })
  encryptedNote = ""
  @Column({ name: "key_version", type: "varchar", length: 64 })
  keyVersion = ""
  @Column({ name: "public_summary", type: "text" })
  publicSummary = ""
  @Column({ name: "public_approved", type: "boolean", default: false })
  publicApproved = false
  @ForeignKey(() => StaffAccountEntity, { name: "fk_execution_person_daily_approved", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "public_approved_by", type: "varchar", length: 64, nullable: true })
  publicApprovedBy: string | null = null
  @Column({ name: "public_approved_at", type: "datetime", precision: 6, nullable: true })
  publicApprovedAt: Date | null = null
  @ForeignKey(() => StaffAccountEntity, { name: "fk_execution_person_daily_updated", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "updated_by", type: "varchar", length: 64 })
  updatedBy = ""
  @Column({ type: "int", default: 1 })
  version = 1
  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)
  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
