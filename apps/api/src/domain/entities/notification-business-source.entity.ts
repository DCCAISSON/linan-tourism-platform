import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm"
import { TourSessionEntity } from "./tour-session.entity.js"
import { OrderEntity } from "./order.entity.js"
import { NotificationDeliveryTaskEntity } from "./notification-delivery.entity.js"

@Entity({ name: "notification_business_sources" })
@Index("uq_notification_source_key", ["sourceKey"], { unique: true })
@Index("uq_notification_source_task", ["linkedTaskId"], { unique: true })
@Index("idx_notification_source_session", ["sessionId"])
export class NotificationBusinessSourceEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @Column({ type: "varchar", length: 32 })
  kind: "order_created" | "pretrip_updated" = "order_created"

  @ForeignKey(() => TourSessionEntity, { name: "fk_notification_source_session", onDelete: "NO ACTION", onUpdate: "NO ACTION" })
  @Column({ name: "session_id", type: "varchar", length: 64 })
  sessionId = ""

  @ForeignKey(() => OrderEntity, { name: "fk_notification_source_order", onDelete: "NO ACTION", onUpdate: "NO ACTION" })
  @Column({ name: "order_id", type: "varchar", length: 64, nullable: true })
  orderId: string | null = null

  @Column({ name: "source_version", type: "int", unsigned: true })
  sourceVersion = 1

  @Column({ name: "source_key", type: "varchar", length: 160 })
  sourceKey = ""

  @Column({ type: "varchar", length: 120 })
  title = ""

  @Column({ name: "body_text", type: "text" })
  bodyText = ""

  @ForeignKey(() => NotificationDeliveryTaskEntity, { name: "fk_notification_source_task", onDelete: "NO ACTION", onUpdate: "NO ACTION" })
  @Column({ name: "linked_task_id", type: "varchar", length: 64, nullable: true })
  linkedTaskId: string | null = null

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)
}
