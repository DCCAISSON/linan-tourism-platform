import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"
import type { ServiceFeedbackSource, ServiceFeedbackStatus } from "../../modules/feedback/feedback.types.js"

@Entity({ name: "service_feedback" })
@Index("uq_service_feedback_request", ["tourSessionId", "source", "idempotencyKey"], { unique: true })
@Index("idx_service_feedback_session_status", ["tourSessionId", "status"])
export class ServiceFeedbackEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @Column({ name: "tour_session_id", type: "varchar", length: 64 })
  tourSessionId = ""

  @Column({ name: "organization_id", type: "varchar", length: 64 })
  organizationId = ""

  @Column({ name: "order_id", type: "varchar", length: 64, nullable: true })
  orderId: string | null = null

  @Column({ type: "varchar", length: 16 })
  source: ServiceFeedbackSource = "family"

  @Column({ type: "tinyint", unsigned: true })
  rating = 1

  @Column({ type: "varchar", length: 1000 })
  content = ""

  @Column({ name: "contact_name", type: "varchar", length: 80 })
  contactName = ""

  @Column({ name: "allow_public", type: "boolean", default: false })
  allowPublic = false

  @Column({ type: "varchar", length: 16 })
  status: ServiceFeedbackStatus = "submitted"

  @Column({ name: "public_excerpt", type: "varchar", length: 240 })
  publicExcerpt = ""

  @Column({ name: "idempotency_key", type: "varchar", length: 80 })
  idempotencyKey = ""

  @Column({ name: "reviewed_by_staff_id", type: "varchar", length: 64, nullable: true })
  reviewedByStaffId: string | null = null

  @Column({ name: "reviewed_at", type: "datetime", precision: 6, nullable: true })
  reviewedAt: Date | null = null

  @Column({ type: "int", unsigned: true, default: 1 })
  version = 1

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
