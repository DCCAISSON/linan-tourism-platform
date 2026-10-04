import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm"
import type { ArchiveSection } from "../../modules/session-archives/session-archives.types.js"
import { TourSessionEntity } from "./tour-session.entity.js"
import { StaffAccountEntity } from "./staff-account.entity.js"

@Index("created_by", ["createdBy"])
@Entity({ name: "session_archives" })
@Index("uq_session_archive_version", ["tourSessionId", "version"], { unique: true })
export class SessionArchiveEntity {
  @PrimaryColumn({ type: "varchar", length: 64 }) id = ""
  @ForeignKey(() => TourSessionEntity, { name: "session_archives_ibfk_1", onDelete: "RESTRICT", onUpdate: "NO ACTION" })
  @Column({ name: "tour_session_id", type: "varchar", length: 64 }) tourSessionId = ""
  @Column({ name: "organization_id", type: "varchar", length: 64 }) organizationId = ""
  @Column({ type: "int", unsigned: true }) version = 1
  @ForeignKey(() => StaffAccountEntity, { name: "session_archives_ibfk_2", onDelete: "RESTRICT", onUpdate: "NO ACTION" })
  @Column({ name: "created_by", type: "varchar", length: 64 }) createdBy = ""
  @Column({ name: "creator_name", type: "varchar", length: 120 }) creatorName = ""
  @Column({ name: "session_code", type: "varchar", length: 64 }) sessionCode = ""
  @Column({ name: "sections_json", type: "json" }) sections: readonly ArchiveSection[] = []
  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 }) createdAt = new Date(0)
}
