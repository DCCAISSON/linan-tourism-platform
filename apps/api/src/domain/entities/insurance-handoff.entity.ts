import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm"
import { InsuranceBatchEntity } from "./insurance-batch.entity.js"
import type { InsuranceHandoffKind } from "../../modules/insurance/insurance.types.js"

@Entity({ name: "insurance_handoffs" })
@Index("idx_insurance_handoffs_batch", ["batchId", "createdAt"])
export class InsuranceHandoffEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => InsuranceBatchEntity, { name: "fk_insurance_handoffs_batch", onDelete: "CASCADE", onUpdate: "CASCADE" })
  @Column({ name: "batch_id", type: "varchar", length: 64 })
  batchId = ""

  @Column({ type: "varchar", length: 32 })
  kind: InsuranceHandoffKind = "submitted"

  @Column({ name: "roster_version", type: "varchar", length: 64 })
  rosterVersion = ""

  @Column({ name: "actor_id", type: "varchar", length: 64 })
  actorId = ""

  @Column({ type: "text" })
  note = ""

  @Column({ name: "receipt_reference", type: "varchar", length: 255, nullable: true })
  receiptReference: string | null = null

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)
}
