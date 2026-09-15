import { DOMAIN_POLICY_VERSION } from "@linan/contracts"
import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"
import { OrganizationEntity } from "./organization.entity.js"

@Entity({ name: "families" })
@Index("uq_families_organization_code", ["organizationId", "code"], { unique: true })
export class FamilyEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => OrganizationEntity, {
    name: "fk_families_organization",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "organization_id", type: "varchar", length: 64 })
  organizationId = ""

  @Column({ type: "varchar", length: 64 })
  code = ""

  @Column({ name: "primary_contact_name", type: "varchar", length: 120 })
  primaryContactName = ""

  @Column({ name: "policy_version", type: "varchar", length: 64 })
  policyVersion = DOMAIN_POLICY_VERSION

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
