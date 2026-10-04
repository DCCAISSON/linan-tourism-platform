import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from "typeorm"
import type { ContractKind } from "../../modules/contracts/contracts.types.js"

@Entity({ name: "contract_template_versions" })
@Index("uq_contract_templates_session_version", ["tourSessionId", "version"], { unique: true })
export class ContractTemplateVersionEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @Column({ name: "organization_id", type: "varchar", length: 64 })
  organizationId = ""

  @Column({ name: "tour_session_id", type: "varchar", length: 64 })
  tourSessionId = ""

  @Column({ type: "varchar", length: 64 })
  version = ""

  @Column({ type: "varchar", length: 200 })
  title = ""

  @Column({ type: "varchar", length: 32 })
  kind: ContractKind = "domestic_group_tour"

  @Column({ name: "body_ciphertext", type: "mediumtext" })
  bodyCiphertext = ""

  @Column({ name: "body_key_version", type: "varchar", length: 16 })
  bodyKeyVersion = ""

  @Column({ name: "source_filename", type: "varchar", length: 255 })
  sourceFilename = ""

  @Column({ name: "source_sha256", type: "char", length: 64 })
  sourceSha256 = ""

  @Column({ name: "body_sha256", type: "char", length: 64 })
  bodySha256 = ""

  @Column({ name: "created_by", type: "varchar", length: 64 })
  createdBy = ""

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)
}
