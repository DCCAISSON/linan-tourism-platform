import { Column, Entity, ForeignKey, PrimaryColumn, UpdateDateColumn } from "typeorm"
import { TourSessionEntity } from "./tour-session.entity.js"
import { StaffAccountEntity } from "./staff-account.entity.js"

@Entity({ name: "pretrip_configs" })
export class PretripConfigEntity {
  @ForeignKey(() => TourSessionEntity, { name: "fk_pretrip_configs_session", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @PrimaryColumn({ name: "tour_session_id", type: "varchar", length: 64 })
  tourSessionId = ""

  @Column({ name: "gathering_at", type: "datetime", precision: 6, nullable: true })
  gatheringAt: Date | null = null

  @Column({ name: "gathering_place", type: "varchar", length: 255 })
  gatheringPlace = ""

  @Column({ name: "gathering_latitude", type: "double", nullable: true })
  gatheringLatitude: number | null = null

  @Column({ name: "gathering_longitude", type: "double", nullable: true })
  gatheringLongitude: number | null = null

  @Column({ name: "travel_mode", type: "varchar", length: 16 })
  travelMode: "group" | "self" | "mixed" = "group"

  @Column({ name: "itinerary_note", type: "text" })
  itineraryNote = ""

  @Column({ name: "contact_name", type: "varchar", length: 80 })
  contactName = ""

  @Column({ name: "contact_phone", type: "varchar", length: 40 })
  contactPhone = ""

  @Column({ name: "service_contact", type: "varchar", length: 255 })
  serviceContact = ""

  @Column({ name: "notice_version_id", type: "varchar", length: 64, nullable: true })
  noticeVersionId: string | null = null

  @ForeignKey(() => StaffAccountEntity, { name: "fk_pretrip_configs_updated_by", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "updated_by_staff_id", type: "varchar", length: 64 })
  updatedByStaffId = ""

  @Column({ type: "int", unsigned: true, default: 1 })
  version = 1

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
