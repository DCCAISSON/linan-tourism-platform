import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"
import { OrganizationEntity } from "./organization.entity.js"
import { StaffAccountEntity } from "./staff-account.entity.js"
import { BusinessProductEntity } from "./business-product.entity.js"
import { CrmCustomerEntity } from "./crm-customer.entity.js"
import type { InquiryStatus } from "../../modules/business/business.types.js"
@Entity({ name: "business_inquiries" })
@Index("uq_business_inquiries_replay", ["productId", "idempotencyKey"], { unique: true })
export class BusinessInquiryEntity {
  @PrimaryColumn({ type: "varchar", length: 64 }) id = ""
  @ForeignKey(() => BusinessProductEntity, { name: "fk_business_inquiries_product", onDelete: "RESTRICT", onUpdate: "NO ACTION" })
  @Column({ name: "product_id", type: "varchar", length: 64 }) productId = ""
  @ForeignKey(() => OrganizationEntity, { name: "fk_business_inquiries_org", onDelete: "RESTRICT", onUpdate: "NO ACTION" })
  @Column({ name: "organization_id", type: "varchar", length: 64 }) organizationId = ""
  @ForeignKey(() => CrmCustomerEntity, { name: "fk_business_inquiry_customer", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "customer_id", type: "varchar", length: 64, nullable: true }) customerId: string | null = null
  @Column({ name: "idempotency_key", type: "varchar", length: 64 }) idempotencyKey = ""
  @Column({ name: "request_hash", type: "varchar", length: 64 }) requestHash = ""
  @Column({ name: "customer_type", type: "varchar", length: 24 }) customerType: "individual" | "organization" = "individual"
  @Column({ name: "organization_name", type: "varchar", length: 160 }) organizationName = ""
  @Column({ name: "contact_name", type: "varchar", length: 80 }) contactName = ""
  @Column({ type: "varchar", length: 32 }) phone = ""
  @Column({ type: "text" }) request = ""
  @Column({ type: "varchar", length: 24 }) status: InquiryStatus = "inquiry"
  @ForeignKey(() => StaffAccountEntity, { name: "fk_business_inquiries_owner", onDelete: "RESTRICT", onUpdate: "NO ACTION" })
  @Column({ name: "owner_staff_account_id", type: "varchar", length: 64, nullable: true }) ownerStaffAccountId: string | null = null
  @Column({ type: "int", default: 1 }) version = 1
  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 }) createdAt = new Date(0)
  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 }) updatedAt = new Date(0)
}
