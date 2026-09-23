import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"
import { TourSessionEntity } from "./tour-session.entity.js"

@Entity({ name: "execution_daily_reports" })
@Index("uq_execution_daily_report_day", ["tourSessionId", "reportDate"], { unique: true })
export class ExecutionDailyReportEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""
  @ForeignKey(() => TourSessionEntity, { onDelete: "RESTRICT" })
  @Column({ name: "tour_session_id", type: "varchar", length: 64 })
  tourSessionId = ""
  @Column({ name: "report_date", type: "varchar", length: 10 })
  reportDate = ""
  @Column({ name: "lodging_check", type: "text" })
  lodgingCheck = ""
  @Column({ name: "meal_status", type: "text" })
  mealStatus = ""
  @Column({ name: "body_status", type: "text" })
  bodyStatus = ""
  @Column({ type: "text" })
  note = ""
  @Column({ name: "public_summary", type: "text" })
  publicSummary = ""
  @Column({ name: "public_approved", type: "boolean", default: false })
  publicApproved = false
  @Column({ name: "public_approved_by", type: "varchar", length: 64, nullable: true })
  publicApprovedBy: string | null = null
  @Column({ name: "public_approved_at", type: "datetime", precision: 6, nullable: true })
  publicApprovedAt: Date | null = null
  @Column({ name: "updated_by", type: "varchar", length: 64 })
  updatedBy = ""
  @Column({ type: "int", default: 1 })
  version = 1
  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)
  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
