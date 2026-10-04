import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"
import { TourSessionEntity } from "./tour-session.entity.js"
import { StaffAccountEntity } from "./staff-account.entity.js"

@Entity({ name: "execution_events" })
@Index("idx_execution_events_session", ["tourSessionId", "occurredAt"])
@Index("idx_execution_events_person", ["personRef"])
export class ExecutionEventEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""
  @ForeignKey(() => TourSessionEntity, { name: "fk_execution_events_session", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "tour_session_id", type: "varchar", length: 64 })
  tourSessionId = ""
  @Column({ name: "person_ref", type: "varchar", length: 128, nullable: true })
  personRef: string | null = null
  @Column({ type: "varchar", length: 32 })
  category: "objective" | "health" | "safety" | "other" = "objective"
  @Column({ name: "occurred_at", type: "datetime", precision: 6 })
  occurredAt = new Date(0)
  @Column({ type: "text" })
  content = ""
  @Column({ name: "public_summary", type: "text" })
  publicSummary = ""
  @Column({ name: "public_approved", type: "boolean", default: false })
  publicApproved = false
  @ForeignKey(() => StaffAccountEntity, { name: "fk_execution_events_approved_by", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "public_approved_by", type: "varchar", length: 64, nullable: true })
  publicApprovedBy: string | null = null
  @Column({ name: "public_approved_at", type: "datetime", precision: 6, nullable: true })
  publicApprovedAt: Date | null = null
  @ForeignKey(() => StaffAccountEntity, { name: "fk_execution_events_created_by", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "created_by", type: "varchar", length: 64 })
  createdBy = ""
  @ForeignKey(() => StaffAccountEntity, { name: "fk_execution_events_updated_by", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "updated_by", type: "varchar", length: 64 })
  updatedBy = ""
  @Column({ type: "int", default: 1 })
  version = 1
  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)
  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
