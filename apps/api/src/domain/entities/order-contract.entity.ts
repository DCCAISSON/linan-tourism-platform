import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm"
import { EnrollmentEntity } from "./enrollment.entity.js"
import { FamilyEntity } from "./family.entity.js"
import { OrderEntity } from "./order.entity.js"
import { OrganizationEntity } from "./organization.entity.js"
import { TourSessionEntity } from "./tour-session.entity.js"

@Entity({ name: "order_contracts" })
@Index("uq_order_contracts_order", ["orderId"], { unique: true })
export class OrderContractEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => OrganizationEntity, { name: "fk_order_contracts_org", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "organization_id", type: "varchar", length: 64 })
  organizationId = ""

  @ForeignKey(() => TourSessionEntity, { name: "fk_order_contracts_session", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "tour_session_id", type: "varchar", length: 64 })
  tourSessionId = ""

  @ForeignKey(() => FamilyEntity, { name: "fk_order_contracts_family", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "family_id", type: "varchar", length: 64 })
  familyId = ""

  @ForeignKey(() => EnrollmentEntity, { name: "fk_order_contracts_enrollment", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "enrollment_id", type: "varchar", length: 64 })
  enrollmentId = ""

  @ForeignKey(() => OrderEntity, { name: "fk_order_contracts_order", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "order_id", type: "varchar", length: 64 })
  orderId = ""

  @Column({ name: "snapshot_ciphertext", type: "mediumtext" })
  snapshotCiphertext = ""

  @Column({ name: "snapshot_key_version", type: "varchar", length: 16 })
  snapshotKeyVersion = ""

  @Column({ name: "snapshot_hash", type: "char", length: 64 })
  snapshotHash = ""

  @Column({ name: "signed_at", type: "datetime", precision: 6, nullable: true })
  signedAt: Date | null = null

  @Column({ name: "signer_actor_id", type: "varchar", length: 64, nullable: true })
  signerActorId: string | null = null

  @Column({ name: "phone_verified", type: "boolean", default: false })
  phoneVerified = false

  @Column({ name: "signature_ciphertext", type: "mediumtext", nullable: true })
  signatureCiphertext: string | null = null

  @Column({ name: "signature_key_version", type: "varchar", length: 16, nullable: true })
  signatureKeyVersion: string | null = null

  @Column({ name: "signature_hash", type: "char", length: 64, nullable: true })
  signatureHash: string | null = null

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)
}
