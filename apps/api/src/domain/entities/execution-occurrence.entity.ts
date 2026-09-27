import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm"
import { TourSessionEntity } from "./tour-session.entity.js"
import { ExecutionPlanNodeEntity, type ExecutionNodeType } from "./execution-plan-node.entity.js"
import type { PersonRef } from "../../modules/travelers/travelers.types.js"

@Entity({ name: "execution_occurrences" })
@Index("uq_execution_occurrence_revision", ["rootId", "version"], { unique: true })
@Index("idx_execution_occurrence_session", ["tourSessionId", "reportDate"])
export class ExecutionOccurrenceEntity {
  @PrimaryColumn({ type: "varchar", length: 64 }) id = ""
  @ForeignKey(() => TourSessionEntity, { onDelete: "RESTRICT" })
  @Column({ name: "tour_session_id", type: "varchar", length: 64 }) tourSessionId = ""
  @Column({ name: "root_id", type: "varchar", length: 64 }) rootId = ""
  @ForeignKey(() => ExecutionPlanNodeEntity, { onDelete: "RESTRICT" })
  @Column({ name: "node_id", type: "varchar", length: 64, nullable: true }) nodeId: string | null = null
  @Column({ name: "node_version", type: "int", nullable: true }) nodeVersion: number | null = null
  @Column({ name: "person_ref", type: "varchar", length: 128 }) personRef: PersonRef = "paid:"
  @Column({ name: "vehicle_id", type: "varchar", length: 64 }) vehicleId = ""
  @Column({ name: "report_date", type: "varchar", length: 10 }) reportDate = ""
  @Column({ type: "varchar", length: 16 }) type: ExecutionNodeType = "attendance"
  @Column({ type: "varchar", length: 100 }) label = ""
  @Column({ name: "occurred_at", type: "datetime", precision: 6 }) occurredAt = new Date(0)
  @Column({ type: "varchar", length: 20 }) status = ""
  @Column({ type: "varchar", length: 200 }) location = ""
  @Column({ type: "text" }) note = ""
  @Column({ name: "corrects_id", type: "varchar", length: 64, nullable: true }) correctsId: string | null = null
  @Column({ name: "correction_reason", type: "varchar", length: 500 }) correctionReason = ""
  @Column({ type: "int", default: 1 }) version = 1
  @Column({ name: "recorded_by", type: "varchar", length: 64 }) recordedBy = ""
  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 }) createdAt = new Date(0)
}
