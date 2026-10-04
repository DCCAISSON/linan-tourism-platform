import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm"
import { OrganizationEntity } from "./organization.entity.js"
import { StaffAccountEntity } from "./staff-account.entity.js"
import { TourSessionEntity } from "./tour-session.entity.js"
import { TransportConfirmationEntity } from "./transport-confirmation.entity.js"

@Entity({ name: "pretrip_school_confirmations" })
@Index("idx_pretrip_school_confirmations_scope", ["tourSessionId", "schoolId", "status"])
export class PretripSchoolConfirmationEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => TourSessionEntity, { name: "fk_pretrip_school_confirmations_session", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "tour_session_id", type: "varchar", length: 64 })
  tourSessionId = ""

  @ForeignKey(() => OrganizationEntity, { name: "fk_pretrip_school_confirmations_school", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "school_id", type: "varchar", length: 64 })
  schoolId = ""

  @ForeignKey(() => TransportConfirmationEntity, { name: "fk_pretrip_school_confirmations_transport_confirmation", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "transport_confirmation_id", type: "varchar", length: 64 })
  transportConfirmationId = ""

  @Column({ name: "plan_version", type: "int", unsigned: true })
  planVersion = 1

  @Column({ name: "roster_version", type: "varchar", length: 128 })
  rosterVersion = ""

  @Column({ type: "varchar", length: 16 })
  status: "current" | "superseded" = "current"

  @ForeignKey(() => StaffAccountEntity, { name: "fk_pretrip_school_confirmations_signed_by", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "signed_by_staff_id", type: "varchar", length: 64 })
  signedByStaffId = ""

  @CreateDateColumn({ name: "signed_at", type: "datetime", precision: 6 })
  signedAt = new Date(0)
}
