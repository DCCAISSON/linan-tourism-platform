import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm"
import { TourSessionEntity } from "./tour-session.entity.js"
export type ExecutionNodeType = "attendance" | "breakfast" | "lunch" | "dinner" | "room_check"

@Entity({ name: "execution_plan_nodes" })
@Index("idx_execution_node_session", ["tourSessionId", "reportDate"])
export class ExecutionPlanNodeEntity {
  @PrimaryColumn({ type: "varchar", length: 64 }) id = ""
  @ForeignKey(() => TourSessionEntity, { name: "execution_plan_nodes_ibfk_1", onDelete: "RESTRICT", onUpdate: "NO ACTION" })
  @Column({ name: "tour_session_id", type: "varchar", length: 64 }) tourSessionId = ""
  @Column({ name: "report_date", type: "varchar", length: 10 }) reportDate = ""
  @Column({ type: "varchar", length: 16 }) type: ExecutionNodeType = "attendance"
  @Column({ type: "varchar", length: 100 }) label = ""
  @Column({ name: "scheduled_time", type: "varchar", length: 5, nullable: true }) scheduledTime: string | null = null
  @Column({ type: "boolean", default: true }) active = true
  @Column({ type: "int", default: 1 }) version = 1
  @Column({ name: "updated_by", type: "varchar", length: 64 }) updatedBy = ""
  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 }) createdAt = new Date(0)
}
