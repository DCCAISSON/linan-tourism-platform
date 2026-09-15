import { DOMAIN_POLICY_VERSION, PAYMENT_STATUS, type PaymentStatus } from "@linan/contracts"
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

@Entity({ name: "payments" })
@Index("uq_payments_org_payment_no", ["organizationId", "paymentNo"], { unique: true })
@Index("uq_payments_provider_transaction_id", ["providerTransactionId"], { unique: true })
@Index("uq_payments_provider_event_id", ["providerEventId"], { unique: true })
@Index("idx_payments_order", ["orderId"])
export class PaymentEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => OrganizationEntity, {
    name: "fk_payments_organization",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "organization_id", type: "varchar", length: 64 })
  organizationId = ""

  @ForeignKey(() => OrderEntity, {
    name: "fk_payments_order",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "order_id", type: "varchar", length: 64 })
  orderId = ""

  @Column({ name: "payment_no", type: "varchar", length: 96 })
  paymentNo = ""

  @Column({ name: "provider_transaction_id", type: "varchar", length: 128, nullable: true })
  providerTransactionId: string | null = null

  @Column({ name: "provider_event_id", type: "varchar", length: 128, nullable: true })
  providerEventId: string | null = null

  @Column({ type: "varchar", length: 32 })
  status: PaymentStatus = PAYMENT_STATUS.pending

  @Column({ name: "amount_fen", type: "int", unsigned: true })
  amountFen = 0

  @Column({ type: "varchar", length: 32 })
  channel = ""

  @Column({ name: "policy_version", type: "varchar", length: 64 })
  policyVersion = DOMAIN_POLICY_VERSION

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
