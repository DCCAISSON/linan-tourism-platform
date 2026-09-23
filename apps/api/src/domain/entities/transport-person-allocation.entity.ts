import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"
import { TourSessionEntity } from "./tour-session.entity.js"
import { TransportSessionVehicleEntity } from "./transport-session-vehicle.entity.js"

@Entity({ name: "transport_person_allocations" })
@Index("uq_transport_person_allocations_session_dedupe", ["tourSessionId", "dedupeKey"], { unique: true })
@Index("idx_transport_person_allocations_vehicle", ["vehicleId"])
export class TransportPersonAllocationEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => TourSessionEntity, { name: "fk_transport_person_allocations_session", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "tour_session_id", type: "varchar", length: 64 })
  tourSessionId = ""

  @ForeignKey(() => TransportSessionVehicleEntity, { name: "fk_transport_person_allocations_vehicle", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "vehicle_id", type: "varchar", length: 64 })
  vehicleId = ""

  @Column({ name: "person_ref", type: "varchar", length: 128 })
  personRef = ""

  @Column({ name: "dedupe_key", type: "varchar", length: 191 })
  dedupeKey = ""

  @Column({ name: "created_by", type: "varchar", length: 64 })
  createdBy = ""

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
