import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"
import { StaffAccountEntity } from "./staff-account.entity.js"
import { TourSessionEntity } from "./tour-session.entity.js"

@Entity({ name: "evaluation_standards" })
@Index("idx_evaluation_standards_session", ["tourSessionId"])
export class EvaluationStandardEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => TourSessionEntity, { name: "fk_evaluation_standards_session", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "tour_session_id", type: "varchar", length: 64 })
  tourSessionId = ""

  @Column({ type: "varchar", length: 120 })
  title = ""

  @Column({ type: "json" })
  items: readonly { readonly code: "A" | "B"; readonly label: string; readonly description: string }[] = []

  @Column({ type: "json", nullable: true })
  dimensions: readonly { readonly code: string; readonly label: string; readonly description: string }[] | null = null

  @Column({ name: "public_format_note", type: "varchar", length: 160 })
  publicFormatNote = ""

  @ForeignKey(() => StaffAccountEntity, { name: "fk_evaluation_standards_author", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "created_by_staff_id", type: "varchar", length: 64 })
  createdByStaffId = ""

  @Column({ name: "confirmed_at", type: "datetime", precision: 6, nullable: true })
  confirmedAt: Date | null = null

  @Column({ name: "confirmed_by_staff_id", type: "varchar", length: 64, nullable: true })
  confirmedByStaffId: string | null = null

  @Column({ type: "int", unsigned: true, default: 1 })
  version = 1

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
