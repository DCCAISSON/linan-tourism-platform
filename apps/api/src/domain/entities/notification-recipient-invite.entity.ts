import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"
import { OrderEntity } from "./order.entity.js"
import { NotificationRecipientAuthorizationEntity } from "./notification-recipient-authorization.entity.js"

@Entity({ name: "notification_recipient_invites" })
@Index("uq_recipient_invite_token", ["tokenHash"], { unique: true })
@Index("uq_recipient_invite_authorization", ["authorizationId"], { unique: true })
export class NotificationRecipientInviteEntity {
  @PrimaryColumn({ type: "varchar", length: 64 }) id = ""
  @ForeignKey(() => OrderEntity, { name: "fk_recipient_invite_order", onDelete: "NO ACTION", onUpdate: "NO ACTION" })
  @Column({ name: "order_id", type: "varchar", length: 64 }) orderId = ""
  @Column({ name: "inviter_actor_id", type: "varchar", length: 128 }) inviterActorId = ""
  @Column({ name: "token_hash", type: "char", length: 64 }) tokenHash = ""
  @Column({ name: "expires_at", type: "datetime", precision: 6 }) expiresAt = new Date(0)
  @Column({ name: "authorization_deadline", type: "datetime", precision: 6 }) authorizationDeadline = new Date(0)
  @ForeignKey(() => NotificationRecipientAuthorizationEntity, { name: "fk_recipient_invite_authorization", onDelete: "NO ACTION", onUpdate: "NO ACTION" })
  @Column({ name: "authorization_id", type: "varchar", length: 64, nullable: true }) authorizationId: string | null = null
  @Column({ name: "confirmed_at", type: "datetime", precision: 6, nullable: true }) confirmedAt: Date | null = null
  @Column({ name: "revoked_at", type: "datetime", precision: 6, nullable: true }) revokedAt: Date | null = null
  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 }) createdAt = new Date(0)
}

@Entity({ name: "recipient_template_consents" })
@Index("uq_recipient_template_consent", ["authorizationId", "templateId"], { unique: true })
export class RecipientTemplateConsentEntity {
  @PrimaryColumn({ type: "varchar", length: 64 }) id = ""
  @ForeignKey(() => NotificationRecipientAuthorizationEntity, { name: "fk_recipient_consent_authorization", onDelete: "NO ACTION", onUpdate: "NO ACTION" })
  @Column({ name: "authorization_id", type: "varchar", length: 64 }) authorizationId = ""
  @Column({ name: "template_id", type: "varchar", length: 128 }) templateId = ""
  @Column({ type: "varchar", length: 16 }) status: "active" | "rejected" | "consumed" = "rejected"
  @Column({ type: "int", unsigned: true, default: 1 }) version = 1
  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 }) updatedAt = new Date(0)
}
