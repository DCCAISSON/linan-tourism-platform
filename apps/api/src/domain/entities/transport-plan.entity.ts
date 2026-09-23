import { Column, Entity, ForeignKey, PrimaryColumn, UpdateDateColumn } from "typeorm"
import { TourSessionEntity } from "./tour-session.entity.js"

@Entity({ name: "transport_plans" })
export class TransportPlanEntity {
  @ForeignKey(() => TourSessionEntity, { name: "fk_transport_plans_tour_session", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @PrimaryColumn({ name: "tour_session_id", type: "varchar", length: 64 })
  tourSessionId = ""

  @Column({ type: "int", unsigned: true, default: 1 })
  version = 1

  @Column({ name: "current_confirmation_id", type: "varchar", length: 64, nullable: true })
  currentConfirmationId: string | null = null

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
