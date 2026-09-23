import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"
import type { MediaKind, MediaStatus } from "@linan/contracts"
import { TourSessionEntity } from "./tour-session.entity.js"
import { StaffAccountEntity } from "./staff-account.entity.js"

@Entity({ name: "media_assets" })
@Index("uq_media_assets_request", ["tourSessionId", "requestId"], { unique: true })
@Index("idx_media_assets_session_status", ["tourSessionId", "status"])
export class MediaAssetEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""
  @ForeignKey(() => TourSessionEntity, { name: "fk_media_assets_session", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "tour_session_id", type: "varchar", length: 64 })
  tourSessionId = ""
  @ForeignKey(() => StaffAccountEntity, { name: "fk_media_assets_author", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "author_staff_id", type: "varchar", length: 64 })
  authorStaffId = ""
  @Column({ name: "request_id", type: "varchar", length: 36 })
  requestId = ""
  @Column({ name: "content_hash", type: "varchar", length: 64 })
  contentHash = ""
  @Column({ name: "object_key", type: "varchar", length: 255 })
  objectKey = ""
  @Column({ type: "varchar", length: 120 })
  title = ""
  @Column({ type: "varchar", length: 16 })
  kind: MediaKind = "image"
  @Column({ name: "content_type", type: "varchar", length: 64 })
  contentType = ""
  @Column({ name: "byte_size", type: "int", unsigned: true })
  byteSize = 0
  @Column({ type: "varchar", length: 16 })
  status: MediaStatus = "uploading"
  @Column({ type: "int", unsigned: true, default: 1 })
  version = 1
  @Column({ name: "cleanup_pending", type: "boolean", default: false })
  cleanupPending = false
  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)
  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
