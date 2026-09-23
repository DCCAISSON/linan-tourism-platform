import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"
import { OrganizationEntity } from "./organization.entity.js"
import { FamilyEntity } from "./family.entity.js"
import { StaffAccountEntity } from "./staff-account.entity.js"
import type { MarketingConsent } from "../../modules/crm/crm.types.js"

@Entity({ name: "crm_customers" })
@Index("uq_crm_customer_request", ["organizationId", "requestKey"], { unique: true })
@Index("idx_crm_customer_owner", ["ownerId"])
@Index("idx_crm_customer_family", ["familyId"])
export class CrmCustomerEntity {
  @PrimaryColumn({ type: "varchar", length: 64 }) id = ""
  @ForeignKey(() => OrganizationEntity, { name: "fk_crm_customer_org", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "organization_id", type: "varchar", length: 64 }) organizationId = ""
  @Column({ name: "display_name", type: "varchar", length: 120 }) displayName = ""
  @Column({ name: "birth_date", type: "date" }) birthDate = ""
  @Column({ name: "adult_confirmed_by", type: "varchar", length: 64 }) adultConfirmedBy = ""
  @Column({ name: "phone_ciphertext", type: "text" }) phoneCiphertext = ""
  @Column({ name: "phone_masked", type: "varchar", length: 32 }) phoneMasked = ""
  @Column({ name: "person_data_key_version", type: "varchar", length: 16 }) personDataKeyVersion = "v1"
  @Column({ type: "varchar", length: 120 }) source = ""
  @Column({ type: "json" }) tags: string[] = []
  @Column({ name: "marketing_consent", type: "varchar", length: 16 }) marketingConsent: MarketingConsent = "unknown"
  @ForeignKey(() => StaffAccountEntity, { name: "fk_crm_customer_owner", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "owner_id", type: "varchar", length: 64, nullable: true }) ownerId: string | null = null
  @ForeignKey(() => FamilyEntity, { name: "fk_crm_customer_family", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "family_id", type: "varchar", length: 64, nullable: true }) familyId: string | null = null
  @Column({ name: "next_followup_at", type: "datetime", precision: 6, nullable: true }) nextFollowupAt: Date | null = null
  @Column({ type: "int", unsigned: true, default: 1 }) version = 1
  @Column({ name: "request_key", type: "varchar", length: 128 }) requestKey = ""
  @Column({ name: "request_hash", type: "char", length: 64 }) requestHash = ""
  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 }) createdAt = new Date(0)
  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 }) updatedAt = new Date(0)
}
