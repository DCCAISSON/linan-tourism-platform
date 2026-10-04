import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"
import { TourSessionEntity } from "./tour-session.entity.js"
import { StaffAccountEntity } from "./staff-account.entity.js"
import { TransportSessionVehicleEntity } from "./transport-session-vehicle.entity.js"

@Entity({ name: "execution_attendance" })
@Index("uq_execution_attendance_person", ["tourSessionId", "personRef"], { unique: true })
@Index("idx_execution_attendance_vehicle", ["vehicleId"])
export class ExecutionAttendanceEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""
  @ForeignKey(() => TourSessionEntity, { name: "fk_execution_attendance_session", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "tour_session_id", type: "varchar", length: 64 })
  tourSessionId = ""
  @ForeignKey(() => TransportSessionVehicleEntity, { name: "fk_execution_attendance_vehicle", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "vehicle_id", type: "varchar", length: 64 })
  vehicleId = ""
  @Column({ name: "person_ref", type: "varchar", length: 128 })
  personRef = ""
  @Column({ type: "varchar", length: 16 })
  status: "present" | "absent" | "revoked" = "present"
  @Column({ name: "info_checked", type: "boolean", default: false })
  infoChecked = false
  @Column({ name: "group_joined", type: "boolean", default: false })
  groupJoined = false
  @Column({ type: "varchar", length: 500 })
  note = ""
  @ForeignKey(() => StaffAccountEntity, { name: "fk_execution_attendance_updated_by", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "updated_by", type: "varchar", length: 64 })
  updatedBy = ""
  @Column({ type: "int", default: 1 })
  version = 1
  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)
  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
