import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm"
import { OrganizationEntity } from "./organization.entity.js"
import { StaffAccountEntity } from "./staff-account.entity.js"
import { TourSessionEntity } from "./tour-session.entity.js"

@Entity({ name: "notification_content_versions" })
@Index("idx_notification_content_versions_session", ["tourSessionId", "createdAt"])
@Index("idx_notification_content_versions_organization", ["organizationId"])
export class NotificationContentVersionEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => OrganizationEntity, {
    name: "fk_notification_contents_organization",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "organization_id", type: "varchar", length: 64 })
  organizationId = ""

  @ForeignKey(() => TourSessionEntity, {
    name: "fk_notification_contents_session",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "tour_session_id", type: "varchar", length: 64 })
  tourSessionId = ""

  @Column({ type: "varchar", length: 120 })
  title = ""

  @Column({ name: "body_text", type: "text" })
  bodyText = ""

  @Column({ name: "template_id", type: "varchar", length: 128, nullable: true })
  templateId: string | null = null

  @Column({ name: "miniapp_page", type: "varchar", length: 255, nullable: true })
  miniappPage: string | null = null

  @Column({ name: "template_data_json", type: "text" })
  templateDataJson = "{}"

  @ForeignKey(() => StaffAccountEntity, {
    name: "fk_notification_contents_created_by",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "created_by_staff_id", type: "varchar", length: 64 })
  createdByStaffId = ""

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)
}
