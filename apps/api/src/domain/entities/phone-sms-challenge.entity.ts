import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from "typeorm"

@Entity({ name: "phone_sms_challenges" })
@Index("idx_phone_sms_challenges_phone_created", ["phoneHash", "createdAt"])
export class PhoneSmsChallengeEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @Column({ name: "phone_hash", type: "char", length: 64 })
  phoneHash = ""

  @Column({ name: "code_hash", type: "char", length: 64 })
  codeHash = ""

  @Column({ name: "attempt_count", type: "int", unsigned: true, default: 0 })
  attemptCount = 0

  @Column({ name: "expires_at", type: "datetime", precision: 6 })
  expiresAt = new Date(0)

  @Column({ name: "consumed_at", type: "datetime", precision: 6, nullable: true })
  consumedAt: Date | null = null

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)
}
