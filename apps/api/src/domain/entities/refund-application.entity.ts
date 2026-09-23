import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"
import { OrderEntity } from "./order.entity.js"
import { RefundRequestEntity } from "./refund-request.entity.js"
import { StaffAccountEntity } from "./staff-account.entity.js"
import type { ApplicationStatus } from "../../modules/refund-applications/refund-application.policy.js"

export type RefundApplicationLine = { readonly lineId: string; readonly displayName: string; readonly amountFen: number }

@Entity({ name: "refund_applications" })
@Index("uq_refund_applications_order_key", ["orderId", "idempotencyKey"], { unique: true })
@Index("idx_refund_applications_status", ["status", "createdAt"])
export class RefundApplicationEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @Column({ name: "organization_id", type: "varchar", length: 64 })
  organizationId = ""

  @ForeignKey(() => OrderEntity, { name: "fk_refund_applications_order", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "order_id", type: "varchar", length: 64 })
  orderId = ""

  @Column({ name: "idempotency_key", type: "varchar", length: 128 })
  idempotencyKey = ""

  @Column({ type: "varchar", length: 32 })
  status: ApplicationStatus = "submitted"

  @Column({ type: "varchar", length: 255 })
  reason = ""

  @Column({ name: "amount_fen", type: "int", unsigned: true })
  amountFen = 0

  @Column({ type: "json" })
  lines: RefundApplicationLine[] = []

  @Column({ name: "review_reason", type: "text", nullable: true })
  reviewReason: string | null = null

  @ForeignKey(() => StaffAccountEntity, { name: "fk_refund_applications_reviewer", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "reviewed_by_staff_id", type: "varchar", length: 64, nullable: true })
  reviewedByStaffId: string | null = null

  @Column({ name: "reviewed_at", type: "datetime", precision: 6, nullable: true })
  reviewedAt: Date | null = null

  @ForeignKey(() => RefundRequestEntity, { name: "fk_refund_applications_refund", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "refund_request_id", type: "varchar", length: 64, nullable: true })
  refundRequestId: string | null = null

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
