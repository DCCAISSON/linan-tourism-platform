import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"
import { NotificationContentVersionEntity } from "./notification-content-version.entity.js"
import { NotificationRecipientAuthorizationEntity } from "./notification-recipient-authorization.entity.js"
import { OrderEntity } from "./order.entity.js"
import { OrganizationEntity } from "./organization.entity.js"
import { StaffAccountEntity } from "./staff-account.entity.js"
import { TourSessionEntity } from "./tour-session.entity.js"

export type NotificationDeliveryStatus = "pending" | "api_accepted" | "undelivered" | "retryable_failed" | "manual_required"
export type NotificationDeliveryTaskStatus = "pending" | "completed" | "retryable_failed" | "manual_required"

@Entity({ name: "notification_delivery_tasks" })
@Index("uq_notification_tasks_session_key", ["tourSessionId", "idempotencyKey"], { unique: true })
@Index("idx_notification_tasks_session", ["tourSessionId", "createdAt"])
export class NotificationDeliveryTaskEntity {
  @PrimaryColumn({ type: "varchar", length: 64 }) id = ""
  @ForeignKey(() => OrganizationEntity, { name: "fk_notification_tasks_organization", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "organization_id", type: "varchar", length: 64 }) organizationId = ""
  @ForeignKey(() => TourSessionEntity, { name: "fk_notification_tasks_session", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "tour_session_id", type: "varchar", length: 64 }) tourSessionId = ""
  @ForeignKey(() => NotificationContentVersionEntity, { name: "fk_notification_tasks_content", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "content_version_id", type: "varchar", length: 64 }) contentVersionId = ""
  @ForeignKey(() => StaffAccountEntity, { name: "fk_notification_tasks_created_by", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "created_by_staff_id", type: "varchar", length: 64 }) createdByStaffId = ""
  @Column({ type: "varchar", length: 24 }) status: NotificationDeliveryTaskStatus = "pending"
  @Column({ name: "idempotency_key", type: "varchar", length: 128 }) idempotencyKey = ""
  @Column({ name: "request_fingerprint", type: "char", length: 64 }) requestFingerprint = ""
  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 }) createdAt = new Date(0)
  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 }) updatedAt = new Date(0)
}

@Entity({ name: "notification_delivery_targets" })
@Index("uq_notification_targets_task_authorization", ["taskId", "authorizationId"], { unique: true })
@Index("idx_notification_targets_task_status", ["taskId", "status"])
export class NotificationDeliveryTargetEntity {
  @PrimaryColumn({ type: "varchar", length: 64 }) id = ""
  @ForeignKey(() => NotificationDeliveryTaskEntity, { name: "fk_notification_targets_task", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "task_id", type: "varchar", length: 64 }) taskId = ""
  @ForeignKey(() => NotificationRecipientAuthorizationEntity, { name: "fk_notification_targets_authorization", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "authorization_id", type: "varchar", length: 64 }) authorizationId = ""
  @Column({ name: "authorization_version", type: "int", unsigned: true }) authorizationVersion = 1
  @ForeignKey(() => OrderEntity, { name: "fk_notification_targets_order", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "order_id", type: "varchar", length: 64 }) orderId = ""
  @Column({ name: "receiver_name", type: "varchar", length: 120 }) receiverName = ""
  @Column({ type: "varchar", length: 24 }) relation = "guardian"
  @Column({ type: "varchar", length: 24 }) channel = "manual"
  @Column({ name: "subscriber_openid", type: "varchar", length: 128, nullable: true }) subscriberOpenid: string | null = null
  @Column({ type: "varchar", length: 24 }) status: NotificationDeliveryStatus = "pending"
  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 }) createdAt = new Date(0)
  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 }) updatedAt = new Date(0)
}

@Entity({ name: "notification_delivery_attempts" })
@Index("uq_notification_attempts_target_number", ["targetId", "attemptNumber"], { unique: true })
@Index("idx_notification_attempts_task", ["taskId", "createdAt"])
export class NotificationDeliveryAttemptEntity {
  @PrimaryColumn({ type: "varchar", length: 64 }) id = ""
  @ForeignKey(() => NotificationDeliveryTaskEntity, { name: "fk_notification_attempts_task", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "task_id", type: "varchar", length: 64 }) taskId = ""
  @ForeignKey(() => NotificationDeliveryTargetEntity, { name: "fk_notification_attempts_target", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "target_id", type: "varchar", length: 64 }) targetId = ""
  @Column({ name: "attempt_number", type: "int", unsigned: true }) attemptNumber = 1
  @Column({ type: "varchar", length: 24 }) status: NotificationDeliveryStatus = "pending"
  @Column({ name: "error_code", type: "varchar", length: 64, nullable: true }) errorCode: string | null = null
  @Column({ name: "provider_message", type: "varchar", length: 255, nullable: true }) providerMessage: string | null = null
  @Column({ name: "accepted_at", type: "datetime", precision: 6, nullable: true }) acceptedAt: Date | null = null
  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 }) createdAt = new Date(0)
  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 }) updatedAt = new Date(0)
}
