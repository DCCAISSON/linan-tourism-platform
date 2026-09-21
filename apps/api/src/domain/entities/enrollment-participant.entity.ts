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
import { EnrollmentEntity } from "./enrollment.entity.js"
import { FamilyMemberEntity } from "./family-member.entity.js"
import { FamilyEntity } from "./family.entity.js"
import { OrganizationEntity } from "./organization.entity.js"

@Entity({ name: "enrollment_participants" })
@Index("uq_enrollment_participants_enrollment_member", ["enrollmentId", "familyMemberId"], {
  unique: true,
})
@Index("idx_enrollment_participants_organization", ["organizationId"])
@Index("idx_enrollment_participants_family", ["familyId"])
@Index("idx_enrollment_participants_family_member", ["familyMemberId"])
export class EnrollmentParticipantEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => OrganizationEntity, {
    name: "fk_enrollment_participants_organization",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "organization_id", type: "varchar", length: 64 })
  organizationId = ""

  @ForeignKey(() => EnrollmentEntity, {
    name: "fk_enrollment_participants_enrollment",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "enrollment_id", type: "varchar", length: 64 })
  enrollmentId = ""

  @ForeignKey(() => FamilyEntity, {
    name: "fk_enrollment_participants_family",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "family_id", type: "varchar", length: 64 })
  familyId = ""

  @ForeignKey(() => FamilyMemberEntity, {
    name: "fk_enrollment_participants_family_member",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "family_member_id", type: "varchar", length: 64 })
  familyMemberId = ""

  @Column({ name: "display_name_snapshot", type: "varchar", length: 120 })
  displayNameSnapshot = ""

  @Column({ name: "participant_kind_snapshot", type: "varchar", length: 16 })
  participantKindSnapshot: "student" | "adult" = "student"

  @Column({ name: "grade_name_snapshot", type: "varchar", length: 120, nullable: true })
  gradeNameSnapshot: string | null = null

  @Column({ name: "class_name_snapshot", type: "varchar", length: 120, nullable: true })
  classNameSnapshot: string | null = null

  @Column({ name: "identity_ciphertext_snapshot", type: "text", nullable: true })
  identityCiphertextSnapshot: string | null = null

  @Column({ name: "identity_hash_snapshot", type: "char", length: 64, nullable: true })
  identityHashSnapshot: string | null = null

  @Column({ name: "identity_masked_snapshot", type: "varchar", length: 64, nullable: true })
  identityMaskedSnapshot: string | null = null

  @Column({ name: "phone_ciphertext_snapshot", type: "text", nullable: true })
  phoneCiphertextSnapshot: string | null = null

  @Column({ name: "phone_hash_snapshot", type: "char", length: 64, nullable: true })
  phoneHashSnapshot: string | null = null

  @Column({ name: "phone_masked_snapshot", type: "varchar", length: 32, nullable: true })
  phoneMaskedSnapshot: string | null = null

  @Column({ name: "person_data_key_version_snapshot", type: "varchar", length: 16 })
  personDataKeyVersionSnapshot = "v1"

  @Column({ name: "policy_version", type: "varchar", length: 64 })
  policyVersion = DOMAIN_POLICY_VERSION

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
