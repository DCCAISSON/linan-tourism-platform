import { DOMAIN_POLICY_VERSION } from "@linan/contracts"
import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm"
import { OrderLineEntity } from "./order-line.entity.js"
import { OrganizationEntity } from "./organization.entity.js"
import { RefundRequestEntity } from "./refund-request.entity.js"

@Entity({ name: "refund_request_lines" })
@Index("uq_refund_request_lines_request_line", ["refundRequestId", "orderLineId"], {
  unique: true,
})
@Index("idx_refund_request_lines_organization", ["organizationId"])
@Index("idx_refund_request_lines_order_line", ["orderLineId"])
export class RefundRequestLineEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => OrganizationEntity, {
    name: "fk_refund_request_lines_organization",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "organization_id", type: "varchar", length: 64 })
  organizationId = ""

  @ForeignKey(() => RefundRequestEntity, {
    name: "fk_refund_request_lines_refund_request",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "refund_request_id", type: "varchar", length: 64 })
  refundRequestId = ""

  @ForeignKey(() => OrderLineEntity, {
    name: "fk_refund_request_lines_order_line",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "order_line_id", type: "varchar", length: 64 })
  orderLineId = ""

  @Column({ name: "amount_fen", type: "int", unsigned: true })
  amountFen = 0

  @Column({ name: "policy_version", type: "varchar", length: 64 })
  policyVersion = DOMAIN_POLICY_VERSION

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)
}
