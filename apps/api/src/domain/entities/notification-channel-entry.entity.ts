import { Column, Entity, ForeignKey, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"
import { StaffAccountEntity } from "./staff-account.entity.js"
import { TourSessionEntity } from "./tour-session.entity.js"

export type NotificationChannelEntryKind = "enterprise_wechat" | "official_account" | "customer_service"

@Entity({ name: "notification_channel_entries" })
@Index("uq_notification_channel_entries_session_kind", ["tourSessionId", "kind"], { unique: true })
export class NotificationChannelEntryEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => TourSessionEntity, { name: "fk_notification_entries_session", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "tour_session_id", type: "varchar", length: 64 })
  tourSessionId = ""

  @Column({ type: "varchar", length: 32 })
  kind: NotificationChannelEntryKind = "customer_service"

  @Column({ type: "varchar", length: 80 })
  label = ""

  @Column({ type: "varchar", length: 2000 })
  url = ""

  @Column({ type: "boolean", default: false })
  enabled = false

  @ForeignKey(() => StaffAccountEntity, { name: "fk_notification_entries_updated_by", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "updated_by_staff_id", type: "varchar", length: 64 })
  updatedByStaffId = ""

  @Column({ type: "int", unsigned: true, default: 1 })
  version = 1

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
