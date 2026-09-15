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
import { FamilyEntity } from "./family.entity.js"
import { OrganizationEntity } from "./organization.entity.js"
import { SchoolClassEntity } from "./school-class.entity.js"
import { SchoolGradeEntity } from "./school-grade.entity.js"

@Entity({ name: "family_members" })
@Index("uq_family_members_family_code", ["familyId", "code"], { unique: true })
@Index("idx_family_members_organization", ["organizationId"])
@Index("idx_family_members_grade", ["gradeId"])
@Index("idx_family_members_class", ["classId"])
export class FamilyMemberEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => OrganizationEntity, {
    name: "fk_family_members_organization",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "organization_id", type: "varchar", length: 64 })
  organizationId = ""

  @ForeignKey(() => FamilyEntity, {
    name: "fk_family_members_family",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "family_id", type: "varchar", length: 64 })
  familyId = ""

  @Column({ type: "varchar", length: 64 })
  code = ""

  @Column({ name: "display_name", type: "varchar", length: 120 })
  displayName = ""

  @ForeignKey(() => SchoolGradeEntity, {
    name: "fk_family_members_grade",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "grade_id", type: "varchar", length: 64, nullable: true })
  gradeId: string | null = null

  @ForeignKey(() => SchoolClassEntity, {
    name: "fk_family_members_class",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "class_id", type: "varchar", length: 64, nullable: true })
  classId: string | null = null

  @Column({ name: "policy_version", type: "varchar", length: 64 })
  policyVersion = DOMAIN_POLICY_VERSION

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
