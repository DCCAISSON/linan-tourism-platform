import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm"
import { StaffAccountEntity } from "./staff-account.entity.js"

@Entity({ name: "staff_sessions" })
@Index("idx_staff_sessions_account", ["staffAccountId"])
@Index("idx_staff_sessions_token_hash", ["tokenHash"], { unique: true })
export class StaffSessionEntity {
  @PrimaryColumn({ type: "varchar", length: 80 })
  id = ""

  @ForeignKey(() => StaffAccountEntity, {
    name: "fk_staff_sessions_account",
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  })
  @Column({ name: "staff_account_id", type: "varchar", length: 64 })
  staffAccountId = ""

  @Column({ name: "token_hash", type: "char", length: 64 })
  tokenHash = ""

  @Column({ name: "permissions_version", type: "int" })
  permissionsVersion = 1

  @Column({ name: "expires_at", type: "datetime", precision: 6 })
  expiresAt = new Date(0)

  @Column({ name: "revoked_at", type: "datetime", precision: 6, nullable: true })
  revokedAt: Date | null = null

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)
}
