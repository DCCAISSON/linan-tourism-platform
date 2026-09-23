import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"
import { TourSessionEntity } from "./tour-session.entity.js"

@Entity({ name: "execution_health_authorizations" })
@Index("uq_execution_health_authorization_person", ["tourSessionId", "personRef"], { unique: true })
@Index("idx_execution_health_authorization_order", ["orderId"])
export class ExecutionHealthAuthorizationEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""
  @ForeignKey(() => TourSessionEntity, { onDelete: "RESTRICT" })
  @Column({ name: "tour_session_id", type: "varchar", length: 64 })
  tourSessionId = ""
  @Column({ name: "person_ref", type: "varchar", length: 128 })
  personRef = ""
  @Column({ name: "order_id", type: "varchar", length: 64 })
  orderId = ""
  @Column({ name: "family_actor_id", type: "varchar", length: 64 })
  familyActorId = ""
  @Column({ name: "encrypted_health_json", type: "text" })
  encryptedHealthJson = ""
  @Column({ name: "key_version", type: "varchar", length: 16 })
  keyVersion = "v1"
  @Column({ type: "int", default: 1 })
  version = 1
  @Column({ name: "authorized_at", type: "datetime", precision: 6 })
  authorizedAt = new Date(0)
  @Column({ name: "revoked_at", type: "datetime", precision: 6, nullable: true })
  revokedAt: Date | null = null
  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)
  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
