import { DOMAIN_POLICY_VERSION } from "@linan/contracts"
import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm"
import { EnrollmentParticipantEntity } from "./enrollment-participant.entity.js"
import { OrderEntity } from "./order.entity.js"
import { OrganizationEntity } from "./organization.entity.js"

@Entity({ name: "order_lines" })
@Index("uq_order_lines_order_participant", ["orderId", "enrollmentParticipantId"], {
  unique: true,
})
@Index("idx_order_lines_organization", ["organizationId"])
@Index("idx_order_lines_participant", ["enrollmentParticipantId"])
export class OrderLineEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => OrganizationEntity, {
    name: "fk_order_lines_organization",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "organization_id", type: "varchar", length: 64 })
  organizationId = ""

  @ForeignKey(() => OrderEntity, {
    name: "fk_order_lines_order",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "order_id", type: "varchar", length: 64 })
  orderId = ""

  @ForeignKey(() => EnrollmentParticipantEntity, {
    name: "fk_order_lines_enrollment_participant",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "enrollment_participant_id", type: "varchar", length: 64 })
  enrollmentParticipantId = ""

  @Column({ name: "display_name_snapshot", type: "varchar", length: 120 })
  displayNameSnapshot = ""

  @Column({ name: "grade_name_snapshot", type: "varchar", length: 120, nullable: true })
  gradeNameSnapshot: string | null = null

  @Column({ name: "class_name_snapshot", type: "varchar", length: 120, nullable: true })
  classNameSnapshot: string | null = null

  @Column({ name: "amount_fen", type: "int", unsigned: true })
  amountFen = 0

  @Column({ name: "policy_version", type: "varchar", length: 64 })
  policyVersion = DOMAIN_POLICY_VERSION

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)
}
