import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm"
import { TourSessionEntity } from "./tour-session.entity.js"

@Entity({ name: "transport_confirmations" })
@Index("idx_transport_confirmations_session", ["tourSessionId"])
export class TransportConfirmationEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => TourSessionEntity, { name: "fk_transport_confirmations_tour_session", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "tour_session_id", type: "varchar", length: 64 })
  tourSessionId = ""

  @Column({ name: "plan_version", type: "int", unsigned: true })
  planVersion = 1

  @Column({ name: "roster_version", type: "varchar", length: 128 })
  rosterVersion = ""

  @Column({ name: "snapshot_json", type: "json" })
  snapshotJson: unknown = {}

  @Column({ name: "confirmed_by", type: "varchar", length: 64 })
  confirmedBy = ""

  @CreateDateColumn({ name: "confirmed_at", type: "datetime", precision: 6 })
  confirmedAt = new Date(0)

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)
}
