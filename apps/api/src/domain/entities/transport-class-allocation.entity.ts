import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"
import { SchoolClassEntity } from "./school-class.entity.js"
import { TransportSessionVehicleEntity } from "./transport-session-vehicle.entity.js"

@Entity({ name: "transport_class_allocations" })
@Index("idx_transport_class_allocations_vehicle", ["vehicleId"])
@Index("idx_transport_class_allocations_class", ["classId"])
export class TransportClassAllocationEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => TransportSessionVehicleEntity, { name: "fk_transport_class_allocations_vehicle", onDelete: "CASCADE", onUpdate: "CASCADE" })
  @Column({ name: "vehicle_id", type: "varchar", length: 64 })
  vehicleId = ""

  @ForeignKey(() => SchoolClassEntity, { name: "fk_transport_class_allocations_class", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "class_id", type: "varchar", length: 64 })
  classId = ""

  @Column({ name: "student_count", type: "int", unsigned: true })
  studentCount = 0

  @Column({ name: "guardian_count", type: "int", unsigned: true })
  guardianCount = 0

  @Column({ name: "teacher_count", type: "int", unsigned: true })
  teacherCount = 0

  @Column({ name: "other_count", type: "int", unsigned: true })
  otherCount = 0

  @Column({ type: "varchar", length: 255, nullable: true })
  note: string | null = null

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
