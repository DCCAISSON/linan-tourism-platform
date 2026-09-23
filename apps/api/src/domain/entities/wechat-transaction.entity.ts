import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"
import { OrderEntity } from "./order.entity.js"
import { OrganizationEntity } from "./organization.entity.js"
import { RefundRequestEntity } from "./refund-request.entity.js"

export type WechatTransactionKind = "payment" | "refund"
export type WechatTransactionStatus = "pending" | "succeeded" | "failed" | "processing" | "unknown" | "abnormal"

@Entity({ name: "wechat_transactions" })
@Index("uq_wechat_transactions_event", ["kind", "eventId"], { unique: true })
@Index("uq_wechat_transactions_out_trade_no", ["outTradeNo"], { unique: true })
@Index("uq_wechat_transactions_out_refund_no", ["outRefundNo"], { unique: true })
@Index("idx_wechat_transactions_order", ["orderId"])
@Index("idx_wechat_transactions_refund", ["refundRequestId"])
export class WechatTransactionEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => OrganizationEntity, { name: "fk_wechat_transactions_organization", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "organization_id", type: "varchar", length: 64 })
  organizationId = ""

  @Column({ type: "varchar", length: 16 })
  kind: WechatTransactionKind = "payment"

  @Column({ name: "event_id", type: "varchar", length: 128 })
  eventId = ""

  @ForeignKey(() => OrderEntity, { name: "fk_wechat_transactions_order", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "order_id", type: "varchar", length: 64, nullable: true })
  orderId: string | null = null

  @ForeignKey(() => RefundRequestEntity, { name: "fk_wechat_transactions_refund", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "refund_request_id", type: "varchar", length: 64, nullable: true })
  refundRequestId: string | null = null

  @Column({ name: "out_trade_no", type: "varchar", length: 32, nullable: true })
  outTradeNo: string | null = null

  @Column({ name: "out_refund_no", type: "varchar", length: 32, nullable: true })
  outRefundNo: string | null = null

  @Column({ name: "provider_transaction_id", type: "varchar", length: 128, nullable: true })
  providerTransactionId: string | null = null

  @Column({ type: "varchar", length: 32 })
  status: WechatTransactionStatus = "pending"

  @Column({ name: "amount_fen", type: "int", unsigned: true })
  amountFen = 0

  @Column({ name: "abnormal_reason", type: "varchar", length: 255, nullable: true })
  abnormalReason: string | null = null

  @Column({ name: "raw_payload", type: "json" })
  rawPayload: Record<string, unknown> = {}

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
