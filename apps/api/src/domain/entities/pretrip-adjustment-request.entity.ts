import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"
import { OrganizationEntity } from "./organization.entity.js"
import { StaffAccountEntity } from "./staff-account.entity.js"
import { TourSessionEntity } from "./tour-session.entity.js"
import { TransportConfirmationEntity } from "./transport-confirmation.entity.js"

@Entity({ name: "pretrip_adjustment_requests" })
@Index("idx_pretrip_adjustments_session_school", ["tourSessionId", "schoolId", "status"])
export class PretripAdjustmentRequestEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => TourSessionEntity, { name: "fk_pretrip_adjustments_session", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "tour_session_id", type: "varchar", length: 64 })
  tourSessionId = ""

  @ForeignKey(() => OrganizationEntity, { name: "fk_pretrip_adjustments_school", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "school_id", type: "varchar", length: 64 })
  schoolId = ""

  @ForeignKey(() => TransportConfirmationEntity, { name: "fk_pretrip_adjustments_transport_confirmation", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "transport_confirmation_id", type: "varchar", length: 64 })
  transportConfirmationId = ""

  @Column({ name: "plan_version", type: "int", unsigned: true })
  planVersion = 1

  @Column({ name: "roster_version", type: "varchar", length: 128 })
  rosterVersion = ""

  @Column({ type: "varchar", length: 24 })
  kind: "vehicle_change" | "profile_correction" = "vehicle_change"

  @Column({ name: "person_ref", type: "varchar", length: 96, nullable: true })
  personRef: string | null = null

  @Column({ name: "request_text", type: "text" })
  requestText = ""

  @Column({ type: "varchar", length: 16 })
  status: "submitted" | "accepted" | "rejected" = "submitted"

  @ForeignKey(() => StaffAccountEntity, { name: "fk_pretrip_adjustments_requested_by", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "requested_by_staff_id", type: "varchar", length: 64 })
  requestedByStaffId = ""

  @Column({ name: "response_text", type: "text", nullable: true })
  responseText: string | null = null

  @Column({ name: "processed_by_staff_id", type: "varchar", length: 64, nullable: true })
  processedByStaffId: string | null = null

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
