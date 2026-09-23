import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"

export type WechatBillDifferenceKind = "matched" | "wechat_only" | "local_only" | "amount_mismatch" | "refund_mismatch"

@Entity({ name: "wechat_bill_reconciliations" })
@Index("uq_wechat_bill_reconciliations_date", ["billDate"], { unique: true })
export class WechatBillReconciliationEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @Column({ name: "bill_date", type: "date" })
  billDate = "1970-01-01"

  @Column({ name: "content_hash", type: "char", length: 64 })
  contentHash = ""

  @Column({ name: "difference_count", type: "int", unsigned: true })
  differenceCount = 0

  @Column({ name: "confirmed_note", type: "text", nullable: true })
  confirmedNote: string | null = null

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}

@Entity({ name: "wechat_bill_differences" })
@Index("idx_wechat_bill_differences_reconciliation", ["reconciliationId"])
export class WechatBillDifferenceEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @Column({ name: "reconciliation_id", type: "varchar", length: 64 })
  reconciliationId = ""

  @Column({ type: "varchar", length: 32 })
  kind: WechatBillDifferenceKind = "matched"

  @Column({ name: "out_trade_no", type: "varchar", length: 32 })
  outTradeNo = ""

  @Column({ name: "out_refund_no", type: "varchar", length: 32, nullable: true })
  outRefundNo: string | null = null

  @Column({ name: "wechat_amount_fen", type: "int", unsigned: true, nullable: true })
  wechatAmountFen: number | null = null

  @Column({ name: "local_amount_fen", type: "int", unsigned: true, nullable: true })
  localAmountFen: number | null = null

  @Column({ name: "wechat_refund_fen", type: "int", unsigned: true, nullable: true })
  wechatRefundFen: number | null = null

  @Column({ name: "local_refund_fen", type: "int", unsigned: true, nullable: true })
  localRefundFen: number | null = null

  @Column({ type: "text" })
  summary = ""

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)
}
