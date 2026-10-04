import { DOMAIN_POLICY_VERSION } from "@linan/contracts"
import {
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm"
import { OrganizationEntity } from "./organization.entity.js"
import { CatalogContentTemplateEntity } from "./catalog-content-template.entity.js"

@Entity({ name: "catalog_items" })
@Index("uq_catalog_items_org_code", ["organizationId", "code"], { unique: true })
export class CatalogItemEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => OrganizationEntity, {
    name: "fk_catalog_items_organization",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "organization_id", type: "varchar", length: 64 })
  organizationId = ""

  @ForeignKey(() => CatalogContentTemplateEntity, {
    name: "fk_catalog_items_content_template", onDelete: "RESTRICT", onUpdate: "CASCADE",
  })
  @Index("idx_catalog_items_template")
  @Column({ name: "template_id", type: "varchar", length: 64, nullable: true })
  templateId: string | null = null

  @Column({ type: "varchar", length: 64 })
  code = ""

  @Column({ type: "varchar", length: 160 })
  title = ""

  @Column({ type: "varchar", length: 4000, default: "" })
  description = ""

  @Column({ name: "cover_image_url", type: "varchar", length: 2048, default: "" })
  coverImageUrl = ""

  @Column({ type: "varchar", length: 32 })
  status = "active"

  @Column({ name: "policy_version", type: "varchar", length: 64 })
  policyVersion = DOMAIN_POLICY_VERSION

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
