import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm"
import { BusinessInquiryEntity } from "./business-inquiry.entity.js"
import { CrmCustomerEntity } from "./crm-customer.entity.js"

@Entity({ name: "business_inquiry_customer_links" })
@Index("idx_inquiry_customer_link_customer", ["customerId"])
@Index("uq_inquiry_customer_link_version", ["inquiryId", "inquiryVersion", "action"], { unique: true })
export class BusinessInquiryCustomerLinkEntity {
  @PrimaryColumn({ type: "varchar", length: 64 }) id = ""
  @ForeignKey(() => BusinessInquiryEntity, { name: "fk_inquiry_customer_link_inquiry", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "inquiry_id", type: "varchar", length: 64 }) inquiryId = ""
  @ForeignKey(() => CrmCustomerEntity, { name: "fk_inquiry_customer_link_customer", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "customer_id", type: "varchar", length: 64 }) customerId = ""
  @Column({ type: "varchar", length: 16 }) action: "linked" | "unlinked" = "linked"
  @Column({ name: "inquiry_version", type: "int" }) inquiryVersion = 1
  @Column({ name: "actor_id", type: "varchar", length: 64 }) actorId = ""
  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 }) createdAt = new Date(0)
}
