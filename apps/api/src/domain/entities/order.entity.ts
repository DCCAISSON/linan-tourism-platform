import { DOMAIN_POLICY_VERSION, ORDER_STATUS, type OrderStatus } from "@linan/contracts"
import {
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm"
import { EnrollmentEntity } from "./enrollment.entity.js"
import { OrganizationEntity } from "./organization.entity.js"

@Entity({ name: "orders" })
@Index("uq_orders_enrollment", ["enrollmentId"], { unique: true })
@Index("uq_orders_org_code", ["organizationId", "code"], { unique: true })
@Index("uq_orders_request_idempotency_key", ["requestIdempotencyKey"], { unique: true })
export class OrderEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => OrganizationEntity, {
    name: "fk_orders_organization",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "organization_id", type: "varchar", length: 64 })
  organizationId = ""

  @ForeignKey(() => EnrollmentEntity, {
    name: "fk_orders_enrollment",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "enrollment_id", type: "varchar", length: 64 })
  enrollmentId = ""

  @Column({ type: "varchar", length: 64 })
  code = ""

  @Column({ name: "request_idempotency_key", type: "varchar", length: 128 })
  requestIdempotencyKey = ""

  @Column({ name: "payer_name", type: "varchar", length: 120 })
  payerName = ""

  @Column({ type: "varchar", length: 32 })
  status: OrderStatus = ORDER_STATUS.pendingPayment

  @Column({ name: "amount_fen", type: "int", unsigned: true })
  amountFen = 0

  @Column({ name: "paid_fen", type: "int", unsigned: true })
  paidFen = 0

  @Column({ name: "policy_version", type: "varchar", length: 64 })
  policyVersion = DOMAIN_POLICY_VERSION

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
