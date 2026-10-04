import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"
import { OrderEntity } from "./order.entity.js"
import { OrganizationEntity } from "./organization.entity.js"

export type NotificationReceiverRelation = "guardian" | "traveler" | "emergency_contact" | "other"
export type NotificationReceiverChannel = "wechat_subscribe" | "manual"

@Entity({ name: "notification_recipient_authorizations" })
@Index("uq_notification_authorizations_order_key", ["orderId", "idempotencyKey"], { unique: true })
@Index("idx_notification_authorizations_order_active", ["orderId", "active"])
@Index("idx_notification_authorizations_organization", ["organizationId"])
export class NotificationRecipientAuthorizationEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => OrganizationEntity, {
    name: "fk_notification_authorizations_organization",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "organization_id", type: "varchar", length: 64 })
  organizationId = ""

  @ForeignKey(() => OrderEntity, {
    name: "fk_notification_authorizations_order",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "order_id", type: "varchar", length: 64 })
  orderId = ""

  @Column({ name: "family_actor_id", type: "varchar", length: 128 })
  familyActorId = ""

  @Column({ name: "receiver_name", type: "varchar", length: 120 })
  receiverName = ""

  @Column({ type: "varchar", length: 24 })
  relation: NotificationReceiverRelation = "guardian"

  @Column({ type: "varchar", length: 24 })
  channel: NotificationReceiverChannel = "manual"

  @Column({ name: "subscriber_openid", type: "varchar", length: 128, nullable: true })
  subscriberOpenid: string | null = null

  @Column({ type: "boolean", default: true })
  active = true

  @Column({ type: "varchar", length: 24, default: "order" })
  scope: "order" | "pretrip_only" = "order"

  @Column({ name: "expires_at", type: "datetime", precision: 6, nullable: true })
  expiresAt: Date | null = null

  @Column({ name: "revoked_at", type: "datetime", precision: 6, nullable: true })
  revokedAt: Date | null = null

  @Column({ name: "idempotency_key", type: "varchar", length: 128 })
  idempotencyKey = ""

  @Column({ type: "int", unsigned: true, default: 1 })
  version = 1

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
