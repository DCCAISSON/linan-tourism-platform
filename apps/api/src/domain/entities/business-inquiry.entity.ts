import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"
import type { InquiryStatus } from "../../modules/business/business.types.js"
@Entity({ name: "business_inquiries" })
@Index("uq_business_inquiries_replay", ["productId", "idempotencyKey"], { unique: true })
export class BusinessInquiryEntity {
  @PrimaryColumn({ type: "varchar", length: 64 }) id = ""
  @Column({ name: "product_id", type: "varchar", length: 64 }) productId = ""
  @Column({ name: "organization_id", type: "varchar", length: 64 }) organizationId = ""
  @Column({ name: "idempotency_key", type: "varchar", length: 64 }) idempotencyKey = ""
  @Column({ name: "request_hash", type: "varchar", length: 64 }) requestHash = ""
  @Column({ name: "customer_type", type: "varchar", length: 24 }) customerType: "individual" | "organization" = "individual"
  @Column({ name: "organization_name", type: "varchar", length: 160 }) organizationName = ""
  @Column({ name: "contact_name", type: "varchar", length: 80 }) contactName = ""
  @Column({ type: "varchar", length: 32 }) phone = ""
  @Column({ type: "text" }) request = ""
  @Column({ type: "varchar", length: 24 }) status: InquiryStatus = "inquiry"
  @Column({ name: "owner_staff_account_id", type: "varchar", length: 64, nullable: true }) ownerStaffAccountId: string | null = null
  @Column({ type: "int", default: 1 }) version = 1
  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 }) createdAt = new Date(0)
  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 }) updatedAt = new Date(0)
}
