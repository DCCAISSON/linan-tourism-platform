import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm"
import { TourSessionEntity } from "./tour-session.entity.js"
import { StaffAccountEntity } from "./staff-account.entity.js"

@Entity({ name: "pretrip_attachments" })
@Index("idx_pretrip_attachments_session", ["tourSessionId"])
export class PretripAttachmentEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => TourSessionEntity, { name: "fk_pretrip_attachments_session", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "tour_session_id", type: "varchar", length: 64 })
  tourSessionId = ""

  @Column({ type: "varchar", length: 120 })
  title = ""

  @Column({ name: "object_key", type: "varchar", length: 255 })
  objectKey = ""

  @Column({ name: "content_type", type: "varchar", length: 80 })
  contentType = ""

  @Column({ name: "byte_size", type: "int", unsigned: true })
  byteSize = 0

  @ForeignKey(() => StaffAccountEntity, { name: "fk_pretrip_attachments_created_by", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "created_by_staff_id", type: "varchar", length: 64 })
  createdByStaffId = ""

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)
}
