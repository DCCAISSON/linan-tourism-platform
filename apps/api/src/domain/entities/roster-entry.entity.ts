import { DOMAIN_POLICY_VERSION, ROSTER_STATUS, type RosterStatus } from "@linan/contracts"
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
import { EnrollmentParticipantEntity } from "./enrollment-participant.entity.js"
import { OrganizationEntity } from "./organization.entity.js"
import { TourSessionEntity } from "./tour-session.entity.js"

@Entity({ name: "roster_entries" })
@Index("uq_roster_entries_session_credential", ["tourSessionId", "credentialHash"], {
  unique: true,
})
@Index("idx_roster_entries_enrollment", ["enrollmentId"])
@Index("idx_roster_entries_organization", ["organizationId"])
@Index("uq_roster_entries_enrollment_participant", ["enrollmentParticipantId"], { unique: true })
export class RosterEntryEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => OrganizationEntity, {
    name: "fk_roster_entries_organization",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "organization_id", type: "varchar", length: 64 })
  organizationId = ""

  @ForeignKey(() => TourSessionEntity, {
    name: "fk_roster_entries_tour_session",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "tour_session_id", type: "varchar", length: 64 })
  tourSessionId = ""

  @ForeignKey(() => EnrollmentEntity, {
    name: "fk_roster_entries_enrollment",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "enrollment_id", type: "varchar", length: 64 })
  enrollmentId = ""

  @ForeignKey(() => EnrollmentParticipantEntity, {
    name: "fk_roster_entries_enrollment_participant",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "enrollment_participant_id", type: "varchar", length: 64, nullable: true })
  enrollmentParticipantId: string | null = null

  @Column({ name: "display_name", type: "varchar", length: 120 })
  displayName = ""

  @Column({ name: "credential_hash", type: "varchar", length: 128 })
  credentialHash = ""

  @Column({ type: "varchar", length: 32 })
  status: RosterStatus = ROSTER_STATUS.pending

  @Column({ name: "policy_version", type: "varchar", length: 64 })
  policyVersion = DOMAIN_POLICY_VERSION

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
