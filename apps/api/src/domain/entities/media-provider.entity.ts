import { Column, Entity, ForeignKey, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"
import { TourSessionEntity } from "./tour-session.entity.js"
import { StaffAccountEntity } from "./staff-account.entity.js"

@Entity({ name: "media_providers" })
@Index("uq_media_providers_session_kind", ["tourSessionId", "kind"], { unique: true })
export class MediaProviderEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""
  @ForeignKey(() => TourSessionEntity, { name: "fk_media_providers_session", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "tour_session_id", type: "varchar", length: 64 })
  tourSessionId = ""
  @ForeignKey(() => StaffAccountEntity, { name: "fk_media_providers_author", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "updated_by_staff_id", type: "varchar", length: 64 })
  updatedByStaffId = ""
  @Column({ type: "varchar", length: 16 })
  kind: "album" | "live" = "album"
  @Column({ type: "varchar", length: 80 })
  label = ""
  @Column({ type: "varchar", length: 2000 })
  url = ""
  @Column({ type: "boolean", default: false })
  enabled = false
  @Column({ type: "int", unsigned: true, default: 1 })
  version = 1
  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
