import {
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
} from "typeorm"
import { RosterImportBatchEntity } from "./roster-import-batch.entity.js"

@Entity({ name: "roster_import_errors" })
@Index("idx_roster_import_errors_batch", ["batchId"])
export class RosterImportErrorEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => RosterImportBatchEntity, { name: "fk_roster_import_errors_batch", onDelete: "CASCADE", onUpdate: "CASCADE" })
  @Column({ name: "batch_id", type: "varchar", length: 64 })
  batchId = ""

  @Column({ name: "source_row_number", type: "int", unsigned: true })
  sourceRowNumber = 0

  @Column({ type: "varchar", length: 16, nullable: true })
  role: "student" | "guardian" | "teacher" | null = null

  @Column({ type: "varchar", length: 64 })
  field = ""

  @Column({ type: "varchar", length: 255 })
  message = ""

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)
}
