import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"
import { StaffAccountEntity } from "./staff-account.entity.js"
import { TourSessionEntity } from "./tour-session.entity.js"
import { TransportSessionVehicleEntity } from "./transport-session-vehicle.entity.js"

@Index("idx_execution_assignment_vehicle", ["vehicleId"])
@Index("idx_execution_assignment_session", ["tourSessionId"])
@Entity({ name: "execution_guide_assignments" })
@Index("uq_execution_assignment", ["staffAccountId", "tourSessionId", "scopeKey"], { unique: true })
export class ExecutionGuideAssignmentEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""
  @ForeignKey(() => StaffAccountEntity, { name: "fk_execution_assignment_staff", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "staff_account_id", type: "varchar", length: 64 })
  staffAccountId = ""
  @ForeignKey(() => TourSessionEntity, { name: "fk_execution_assignment_session", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "tour_session_id", type: "varchar", length: 64 })
  tourSessionId = ""
  @ForeignKey(() => TransportSessionVehicleEntity, { name: "fk_execution_assignment_vehicle", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "vehicle_id", type: "varchar", length: 64, nullable: true })
  vehicleId: string | null = null
  @Column({ name: "scope_key", type: "varchar", length: 64 })
  scopeKey = "session"
  @Column({ type: "boolean", default: true })
  active = true
  @Column({ type: "int", default: 1 })
  version = 1
  @Column({ type: "varchar", length: 500 })
  reason = ""
  @ForeignKey(() => StaffAccountEntity, { name: "fk_execution_assignment_updated_by", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "updated_by", type: "varchar", length: 64 })
  updatedBy = ""
  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)
  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
