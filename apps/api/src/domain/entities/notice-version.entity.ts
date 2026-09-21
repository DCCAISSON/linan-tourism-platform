import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm"
import { OrganizationEntity } from "./organization.entity.js"
import { TourSessionEntity } from "./tour-session.entity.js"

export type NoticeContentJson = {
  readonly destination: string
  readonly departurePlace: string
  readonly mealNote: string
  readonly itinerary: readonly string[]
  readonly unitPrices: readonly string[]
  readonly packageExamples: readonly string[]
  readonly reminders: readonly string[]
}

@Entity({ name: "notice_versions" })
@Index("uq_notice_versions_session_version", ["tourSessionId", "version"], { unique: true })
@Index("idx_notice_versions_organization", ["organizationId"])
export class NoticeVersionEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => OrganizationEntity, {
    name: "fk_notice_versions_organization",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "organization_id", type: "varchar", length: 64 })
  organizationId = ""

  @ForeignKey(() => TourSessionEntity, {
    name: "fk_notice_versions_tour_session",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "tour_session_id", type: "varchar", length: 64 })
  tourSessionId = ""

  @Column({ type: "varchar", length: 64 })
  version = ""

  @Column({ type: "varchar", length: 255 })
  title = ""

  @Column({ name: "content_json", type: "json" })
  contentJson: NoticeContentJson = {
    destination: "",
    departurePlace: "",
    mealNote: "",
    itinerary: [],
    unitPrices: [],
    packageExamples: [],
    reminders: [],
  }

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)
}
