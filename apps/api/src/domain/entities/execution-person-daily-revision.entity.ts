import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm"
import type { PersonRef } from "../../modules/travelers/travelers.types.js"
import { ExecutionPersonDailyReportEntity, type DailyMealStatus } from "./execution-person-daily-report.entity.js"
import { StaffAccountEntity } from "./staff-account.entity.js"
import { TourSessionEntity } from "./tour-session.entity.js"

export type PersonDailySnapshot = {
  readonly lodgingCheck: string; readonly mealStatus: string
  readonly breakfast: DailyMealStatus; readonly lunch: DailyMealStatus; readonly dinner: DailyMealStatus
  readonly breakfastNote: string; readonly lunchNote: string; readonly dinnerNote: string
  readonly encryptedBodyStatus: string; readonly encryptedNote: string; readonly keyVersion: string
  readonly publicSummary: string; readonly publicApproved: boolean
  readonly publicApprovedBy: string | null; readonly publicApprovedAt: string | null
  readonly createdAt: string; readonly updatedAt: string
}

@Entity({ name: "execution_person_daily_revisions" })
@Index("uq_execution_daily_revision", ["reportId", "version"], { unique: true })
@Index("idx_execution_daily_revision_session", ["tourSessionId"])
export class ExecutionPersonDailyRevisionEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""
  @ForeignKey(() => ExecutionPersonDailyReportEntity, { name: "fk_person_daily_revision_report", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "report_id", type: "varchar", length: 64 })
  reportId = ""
  @ForeignKey(() => TourSessionEntity, { name: "fk_person_daily_revision_session", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "tour_session_id", type: "varchar", length: 64 })
  tourSessionId = ""
  @Column({ name: "person_ref", type: "varchar", length: 128 })
  personRef: PersonRef = "paid:"
  @Column({ name: "report_date", type: "varchar", length: 10 })
  reportDate = ""
  @Column({ type: "int" })
  version = 1
  @ForeignKey(() => StaffAccountEntity, { name: "fk_person_daily_revision_actor", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "recorded_by", type: "varchar", length: 64 })
  recordedBy = ""
  @Column({ name: "correction_reason", type: "varchar", length: 1000 })
  correctionReason = ""
  @Column({ type: "json" })
  snapshot: PersonDailySnapshot = { lodgingCheck: "", mealStatus: "", breakfast: null, lunch: null, dinner: null, breakfastNote: "", lunchNote: "", dinnerNote: "", encryptedBodyStatus: "", encryptedNote: "", keyVersion: "", publicSummary: "", publicApproved: false, publicApprovedBy: null, publicApprovedAt: null, createdAt: "", updatedAt: "" }
  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)
}
