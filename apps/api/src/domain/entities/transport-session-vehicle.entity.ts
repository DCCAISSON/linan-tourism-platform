import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"
import { OrganizationEntity } from "./organization.entity.js"
import { TourSessionEntity } from "./tour-session.entity.js"

export type TransportContactSnapshot = {
  readonly driverName: string
  readonly driverPhone: string
  readonly guideName: string
  readonly guidePhone: string
  readonly teacherName: string
  readonly teacherPhone: string
}

@Entity({ name: "transport_session_vehicles" })
@Index("uq_transport_session_vehicles_session_sequence", ["tourSessionId", "sequence"], { unique: true })
@Index("idx_transport_session_vehicles_organization", ["organizationId"])
export class TransportSessionVehicleEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => OrganizationEntity, { name: "fk_transport_session_vehicles_organization", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "organization_id", type: "varchar", length: 64 })
  organizationId = ""

  @ForeignKey(() => TourSessionEntity, { name: "fk_transport_session_vehicles_tour_session", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "tour_session_id", type: "varchar", length: 64 })
  tourSessionId = ""

  @Column({ type: "int", unsigned: true })
  sequence = 0

  @Column({ name: "seat_capacity", type: "int", unsigned: true })
  seatCapacity = 0

  @Column({ name: "plate_number", type: "varchar", length: 64, nullable: true })
  plateNumber: string | null = null

  @Column({ name: "contact_snapshot_json", type: "json" })
  contactSnapshotJson: TransportContactSnapshot = {
    driverName: "",
    driverPhone: "",
    guideName: "",
    guidePhone: "",
    teacherName: "",
    teacherPhone: "",
  }

  @Column({ name: "created_by", type: "varchar", length: 64 })
  createdBy = ""

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
