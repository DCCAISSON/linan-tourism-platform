import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"

export type UserTemplateField = { readonly key: string; readonly label: string; readonly rule: "thing" | "number" | "time" }
export type UserSubscriptionStatus = "active" | "rejected" | "withdrawn" | "consumed"
export type UserDeliveryStatus = "pending" | "api_accepted" | "rejected" | "unknown" | "blocked"

@Entity({ name: "user_notification_templates" })
@Index("uq_user_notification_template_wechat", ["templateId"], { unique: true })
export class UserNotificationTemplateEntity {
  @PrimaryColumn({ type: "varchar", length: 64 }) id = ""
  @Column({ type: "varchar", length: 120 }) title = ""
  @Column({ type: "varchar", length: 120 }) category = ""
  @Column({ name: "template_id", type: "varchar", length: 128 }) templateId = ""
  @Column({ type: "varchar", length: 16 }) type: "once" = "once"
  @Column({ type: "json" }) fields: UserTemplateField[] = []
  @Column({ type: "boolean" }) enabled = false
  @Column({ name: "updated_by", type: "varchar", length: 64 }) updatedBy = ""
  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 }) createdAt = new Date(0)
  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 }) updatedAt = new Date(0)
}

@Entity({ name: "user_notification_subscriptions" })
@Index("uq_user_notification_actor_template", ["actorId", "templateId"], { unique: true })
export class UserNotificationSubscriptionEntity {
  @PrimaryColumn({ type: "varchar", length: 64 }) id = ""
  @Column({ name: "actor_id", type: "varchar", length: 64 }) actorId = ""
  @Column({ name: "template_id", type: "varchar", length: 64 }) templateId = ""
  @Column({ type: "varchar", length: 128 }) openid = ""
  @Column({ type: "varchar", length: 16 }) status: UserSubscriptionStatus = "rejected"
  @Column({ type: "int", unsigned: true }) version = 1
  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 }) createdAt = new Date(0)
  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 }) updatedAt = new Date(0)
}

@Entity({ name: "user_notification_tasks" })
@Index("uq_user_notification_task_key", ["idempotencyKey"], { unique: true })
export class UserNotificationTaskEntity {
  @PrimaryColumn({ type: "varchar", length: 64 }) id = ""
  @Column({ name: "template_id", type: "varchar", length: 64 }) templateId = ""
  @Column({ name: "idempotency_key", type: "varchar", length: 128 }) idempotencyKey = ""
  @Column({ name: "request_fingerprint", type: "char", length: 64 }) requestFingerprint = ""
  @Column({ name: "payload_snapshot", type: "json" }) payloadSnapshot: {
    templateId: string; title: string; page: string | null; data: Record<string, { value: string }>
  } = { templateId: "", title: "", page: null, data: {} }
  @Column({ name: "created_by", type: "varchar", length: 64 }) createdBy = ""
  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 }) createdAt = new Date(0)
}

@Entity({ name: "user_notification_targets" })
@Index("uq_user_notification_target_subscription", ["taskId", "subscriptionId"], { unique: true })
export class UserNotificationTargetEntity {
  @PrimaryColumn({ type: "varchar", length: 64 }) id = ""
  @Column({ name: "task_id", type: "varchar", length: 64 }) taskId = ""
  @Column({ name: "subscription_id", type: "varchar", length: 64 }) subscriptionId = ""
  @Column({ name: "subscription_version", type: "int", unsigned: true }) subscriptionVersion = 1
  @Column({ type: "varchar", length: 24 }) status: UserDeliveryStatus = "pending"
}

@Entity({ name: "user_notification_attempts" })
@Index("uq_user_notification_attempt_target", ["targetId"], { unique: true })
export class UserNotificationAttemptEntity {
  @PrimaryColumn({ type: "varchar", length: 64 }) id = ""
  @Column({ name: "task_id", type: "varchar", length: 64 }) taskId = ""
  @Column({ name: "target_id", type: "varchar", length: 64 }) targetId = ""
  @Column({ name: "sent_by", type: "varchar", length: 64 }) sentBy = ""
  @Column({ type: "varchar", length: 24 }) status: UserDeliveryStatus = "unknown"
  @Column({ name: "error_code", type: "varchar", length: 64, nullable: true }) errorCode: string | null = null
  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 }) createdAt = new Date(0)
  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 }) updatedAt = new Date(0)
}
