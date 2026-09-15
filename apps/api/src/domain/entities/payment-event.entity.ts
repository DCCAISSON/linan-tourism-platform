import { DOMAIN_POLICY_VERSION, PAYMENT_STATUS, type PaymentStatus } from "@linan/contracts"
import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm"
import { OrganizationEntity } from "./organization.entity.js"
import { PaymentEntity } from "./payment.entity.js"

@Entity({ name: "payment_events" })
@Index("uq_payment_events_provider_event", ["provider", "providerEventId"], { unique: true })
@Index("idx_payment_events_organization", ["organizationId"])
@Index("idx_payment_events_payment", ["paymentId"])
export class PaymentEventEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => OrganizationEntity, {
    name: "fk_payment_events_organization",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "organization_id", type: "varchar", length: 64 })
  organizationId = ""

  @ForeignKey(() => PaymentEntity, {
    name: "fk_payment_events_payment",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "payment_id", type: "varchar", length: 64 })
  paymentId = ""

  @Column({ type: "varchar", length: 32 })
  provider = ""

  @Column({ name: "provider_event_id", type: "varchar", length: 128 })
  providerEventId = ""

  @Column({ name: "provider_transaction_id", type: "varchar", length: 128, nullable: true })
  providerTransactionId: string | null = null

  @Column({ type: "varchar", length: 32 })
  status: PaymentStatus = PAYMENT_STATUS.pending

  @Column({ name: "amount_fen", type: "int", unsigned: true })
  amountFen = 0

  @Column({ name: "policy_version", type: "varchar", length: 64 })
  policyVersion = DOMAIN_POLICY_VERSION

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)
}
