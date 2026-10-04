import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm"
import { CrmCustomerEntity } from "./crm-customer.entity.js"

@Entity({ name: "crm_followups" })
@Index("uq_crm_followup_request", ["customerId", "requestKey"], { unique: true })
export class CrmFollowupEntity {
  @PrimaryColumn({ type: "varchar", length: 64 }) id = ""
  @ForeignKey(() => CrmCustomerEntity, { name: "fk_crm_followup_customer", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "customer_id", type: "varchar", length: 64 }) customerId = ""
  @Column({ type: "varchar", length: 1000 }) content = ""
  @Column({ name: "next_followup_at", type: "datetime", precision: 6, nullable: true }) nextFollowupAt: Date | null = null
  @Column({ name: "created_by", type: "varchar", length: 64 }) createdBy = ""
  @Column({ name: "request_key", type: "varchar", length: 128 }) requestKey = ""
  @Column({ name: "request_hash", type: "char", length: 64 }) requestHash = ""
  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 }) createdAt = new Date(0)
}
