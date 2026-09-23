import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm"
import { RosterImportPersonEntity } from "./roster-import-person.entity.js"

@Entity({ name: "traveler_import_changes" })
@Index("idx_traveler_import_changes_person", ["importPersonId"])
export class TravelerImportChangeEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => RosterImportPersonEntity, { name: "fk_traveler_import_changes_person", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "import_person_id", type: "varchar", length: 64 })
  importPersonId = ""

  @Column({ name: "actor_id", type: "varchar", length: 64 })
  actorId = ""

  @Column({ type: "varchar", length: 16 })
  action: "confirm" | "disable" | "correct" = "confirm"

  @Column({ type: "varchar", length: 500 })
  reason = ""

  @Column({ name: "before_values", type: "json" })
  beforeValues: Record<string, string | number | null> = {}

  @Column({ name: "after_values", type: "json" })
  afterValues: Record<string, string | number | null> = {}

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)
}
