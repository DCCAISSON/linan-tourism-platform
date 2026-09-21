import { DOMAIN_POLICY_VERSION } from "@linan/contracts"
import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm"
import { EnrollmentEntity } from "./enrollment.entity.js"
import { FamilyEntity } from "./family.entity.js"
import { OrganizationEntity } from "./organization.entity.js"

@Entity({ name: "consent_records" })
@Index(
  "uq_consent_records_subject_purpose_agreement_schema",
  ["organizationId", "subjectId", "purpose", "agreementVersion", "schemaVersion"],
  { unique: true },
)
@Index("idx_consent_records_subject", ["subjectId"])
@Index("idx_consent_records_family", ["familyId"])
export class ConsentRecordEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => OrganizationEntity, {
    name: "fk_consent_records_organization",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "organization_id", type: "varchar", length: 64 })
  organizationId = ""

  @ForeignKey(() => FamilyEntity, {
    name: "fk_consent_records_family",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "family_id", type: "varchar", length: 64, nullable: true })
  familyId: string | null = null

  @ForeignKey(() => EnrollmentEntity, {
    name: "fk_consent_records_subject",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "subject_id", type: "varchar", length: 64 })
  subjectId = ""

  @Column({ type: "varchar", length: 64 })
  purpose = ""

  @Column({ type: "boolean" })
  granted = false

  @Column({ name: "agreement_version", type: "varchar", length: 64 })
  agreementVersion = ""

  @Column({ name: "schema_version", type: "varchar", length: 64 })
  schemaVersion = ""

  @Column({ name: "notice_version_id", type: "varchar", length: 64, nullable: true })
  noticeVersionId: string | null = null

  @Column({ name: "notice_version", type: "varchar", length: 64, nullable: true })
  noticeVersion: string | null = null

  @Column({ name: "accepted_at", type: "datetime", precision: 6 })
  acceptedAt = new Date(0)

  @Column({ name: "revoked_at", type: "datetime", precision: 6, nullable: true })
  revokedAt: Date | null = null

  @Column({ name: "policy_version", type: "varchar", length: 64 })
  policyVersion = DOMAIN_POLICY_VERSION

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)
}
