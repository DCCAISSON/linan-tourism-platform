import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"
import { OrderEntity } from "./order.entity.js"
import { OrderLineEntity } from "./order-line.entity.js"
import type { ChangeHistoryEntry, ChangeParticipant, OrderChangeKind, OrderChangeStatus, OriginalOrderSnapshot } from "../../modules/order-change/order-change.types.js"

@Entity({ name: "order_change_requests" })
@Index("uq_order_changes_order_key", ["orderId", "idempotencyKey"], { unique: true })
@Index("idx_order_changes_status", ["status", "createdAt"])
export class OrderChangeRequestEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @Column({ name: "organization_id", type: "varchar", length: 64 })
  organizationId = ""

  @ForeignKey(() => OrderEntity, { name: "fk_order_changes_order", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "order_id", type: "varchar", length: 64 })
  orderId = ""

  @Column({ type: "varchar", length: 24 })
  kind: OrderChangeKind = "addition"

  @ForeignKey(() => OrderLineEntity, { name: "fk_order_changes_original_line", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "original_line_id", type: "varchar", length: 64, nullable: true })
  originalLineId: string | null = null

  @Column({ name: "idempotency_key", type: "varchar", length: 128 })
  idempotencyKey = ""

  @Column({ name: "submission_fingerprint", type: "char", length: 64 })
  submissionFingerprint = ""

  @Column({ type: "varchar", length: 32 })
  status: OrderChangeStatus = "submitted"

  @Column({ type: "int", unsigned: true, default: 1 })
  version = 1

  @Column({ type: "varchar", length: 255 })
  reason = ""

  @Column({ name: "original_snapshot", type: "json" })
  originalSnapshot: OriginalOrderSnapshot = { orderCode: "", amountFen: 0, paidFen: 0, tourSessionId: "", lines: [] }

  @Column({ name: "proposed_participant", type: "json" })
  declare proposedParticipant: ChangeParticipant

  @Column({ type: "json" })
  history: ChangeHistoryEntry[] = []

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
