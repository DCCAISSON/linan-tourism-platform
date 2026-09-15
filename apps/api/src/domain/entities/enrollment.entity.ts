import { DOMAIN_POLICY_VERSION, ENROLLMENT_STATUS, type EnrollmentStatus } from "@linan/contracts"
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
import { TourSessionEntity } from "./tour-session.entity.js"

@Entity({ name: "enrollments" })
@Index("uq_enrollments_org_code", ["organizationId", "code"], { unique: true })
@Index("idx_enrollments_tour_session", ["tourSessionId"])
export class EnrollmentEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => OrganizationEntity, {
    name: "fk_enrollments_organization",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "organization_id", type: "varchar", length: 64 })
  organizationId = ""

  @ForeignKey(() => TourSessionEntity, {
    name: "fk_enrollments_tour_session",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "tour_session_id", type: "varchar", length: 64 })
  tourSessionId = ""

  @Column({ type: "varchar", length: 64 })
  code = ""

  @Column({ name: "contact_name", type: "varchar", length: 120 })
  contactName = ""

  @Column({ name: "participant_count", type: "int", unsigned: true })
  participantCount = 0

  @Column({ type: "varchar", length: 32 })
  status: EnrollmentStatus = ENROLLMENT_STATUS.pending

  @Column({ name: "policy_version", type: "varchar", length: 64 })
  policyVersion = DOMAIN_POLICY_VERSION

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
