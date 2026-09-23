import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"
import { InsuranceBatchEntity } from "./insurance-batch.entity.js"
import type { InsuranceIssueCode, InsurancePersonStatus } from "../../modules/insurance/insurance.types.js"
import type { PersonRef } from "../../modules/travelers/travelers.types.js"

@Entity({ name: "insurance_batch_people" })
@Index("uq_insurance_batch_people_person", ["batchId", "personRef"], { unique: true })
@Index("idx_insurance_batch_people_status", ["batchId", "status"])
export class InsuranceBatchPersonEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => InsuranceBatchEntity, { name: "fk_insurance_batch_people_batch", onDelete: "CASCADE", onUpdate: "CASCADE" })
  @Column({ name: "batch_id", type: "varchar", length: 64 })
  batchId = ""

  @Column({ name: "person_ref", type: "varchar", length: 96 })
  personRef: PersonRef = "paid:"

  @Column({ name: "source_refs_json", type: "json" })
  sourceRefsJson: PersonRef[] = []

  @Column({ name: "display_name", type: "varchar", length: 120 })
  displayName = ""

  @Column({ name: "class_name", type: "varchar", length: 120, nullable: true })
  className: string | null = null

  @Column({ name: "identity_masked", type: "varchar", length: 64, nullable: true })
  identityMasked: string | null = null

  @Column({ name: "identity_ciphertext", type: "text", nullable: true })
  identityCiphertext: string | null = null

  @Column({ name: "phone_masked", type: "varchar", length: 32, nullable: true })
  phoneMasked: string | null = null

  @Column({ name: "phone_ciphertext", type: "text", nullable: true })
  phoneCiphertext: string | null = null

  @Column({ name: "person_data_key_version", type: "varchar", length: 16 })
  personDataKeyVersion = ""

  @Column({ type: "varchar", length: 32 })
  status: InsurancePersonStatus = "ready"

  @Column({ name: "issue_code", type: "varchar", length: 32, nullable: true })
  issueCode: InsuranceIssueCode = null

  @Column({ name: "policy_number", type: "varchar", length: 120, nullable: true })
  policyNumber: string | null = null

  @Column({ name: "receipt_reference", type: "varchar", length: 255, nullable: true })
  receiptReference: string | null = null

  @Column({ name: "coverage_start", type: "date", nullable: true })
  coverageStart: string | null = null

  @Column({ name: "coverage_end", type: "date", nullable: true })
  coverageEnd: string | null = null

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
