import {
  DOMAIN_POLICY_VERSION,
  REFUND_PROVIDER,
  REFUND_STATUS,
  type RefundProvider,
  type RefundStatus,
} from "@linan/contracts"
import {
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm"
import { OrderEntity } from "./order.entity.js"
import { OrganizationEntity } from "./organization.entity.js"
import { StaffAccountEntity } from "./staff-account.entity.js"

@Entity({ name: "refund_requests" })
@Index("uq_refund_requests_org_idempotency_key", ["organizationId", "idempotencyKey"], {
  unique: true,
})
@Index("idx_refund_requests_order", ["orderId"])
@Index("idx_refund_requests_requested_by_staff", ["requestedByStaffId"])
@Index("idx_refund_requests_processed_by_staff", ["processedByStaffId"])
export class RefundRequestEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => OrganizationEntity, {
    name: "fk_refund_requests_organization",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "organization_id", type: "varchar", length: 64 })
  organizationId = ""

  @ForeignKey(() => OrderEntity, {
    name: "fk_refund_requests_order",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "order_id", type: "varchar", length: 64 })
  orderId = ""

  @Column({ type: "varchar", length: 32 })
  provider: RefundProvider = REFUND_PROVIDER.localValidation

  @Column({ name: "idempotency_key", type: "varchar", length: 128 })
  idempotencyKey = ""

  @Column({ type: "varchar", length: 32 })
  status: RefundStatus = REFUND_STATUS.pending

  @Column({ type: "varchar", length: 255 })
  reason = ""

  @Column({ type: "text", nullable: true })
  note: string | null = null

  @Column({ name: "amount_fen", type: "int", unsigned: true })
  amountFen = 0

  @ForeignKey(() => StaffAccountEntity, {
    name: "fk_refund_requests_requested_by_staff",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "requested_by_staff_id", type: "varchar", length: 64 })
  requestedByStaffId = ""

  @ForeignKey(() => StaffAccountEntity, {
    name: "fk_refund_requests_processed_by_staff",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "processed_by_staff_id", type: "varchar", length: 64, nullable: true })
  processedByStaffId: string | null = null

  @Column({ name: "failure_message", type: "text", nullable: true })
  failureMessage: string | null = null

  @Column({ name: "requested_at", type: "datetime", precision: 6 })
  requestedAt = new Date(0)

  @Column({ name: "processed_at", type: "datetime", precision: 6, nullable: true })
  processedAt: Date | null = null

  @Column({ name: "policy_version", type: "varchar", length: 64 })
  policyVersion = DOMAIN_POLICY_VERSION

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
