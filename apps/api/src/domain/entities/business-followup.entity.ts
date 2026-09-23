import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from "typeorm"
import type { InquiryStatus } from "../../modules/business/business.types.js"
@Entity({ name: "business_followups" })
@Index("uq_business_followups_replay", ["inquiryId", "idempotencyKey"], { unique: true })
export class BusinessFollowupEntity {
  @PrimaryColumn({ type: "varchar", length: 64 }) id = ""
  @Column({ name: "inquiry_id", type: "varchar", length: 64 }) inquiryId = ""
  @Column({ name: "idempotency_key", type: "varchar", length: 64 }) idempotencyKey = ""
  @Column({ name: "request_hash", type: "varchar", length: 64 }) requestHash = ""
  @Column({ name: "actor_id", type: "varchar", length: 64 }) actorId = ""
  @Column({ name: "owner_staff_account_id", type: "varchar", length: 64 }) ownerStaffAccountId = ""
  @Column({ type: "varchar", length: 24 }) status: InquiryStatus = "inquiry"
  @Column({ type: "text" }) note = ""
  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 }) createdAt = new Date(0)
}
