import { Column, CreateDateColumn, Entity, ForeignKey, Index, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm"
import { StaffAccountEntity } from "./staff-account.entity.js"

@Entity({ name: "staff_account_scopes" })
@Index("idx_staff_account_scopes_account", ["staffAccountId"])
export class StaffAccountScopeEntity {
  @PrimaryColumn({ type: "varchar", length: 80 })
  id = ""

  @ForeignKey(() => StaffAccountEntity, {
    name: "fk_staff_account_scopes_account",
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  })
  @Column({ name: "staff_account_id", type: "varchar", length: 64 })
  staffAccountId = ""

  @Column({ name: "scope_kind", type: "varchar", length: 32 })
  scopeKind = ""

  @Column({ name: "scope_id", type: "varchar", length: 64, nullable: true })
  scopeId: string | null = null

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)

  @ManyToOne(() => StaffAccountEntity, (account) => account.scopes, { createForeignKeyConstraints: false })
  @JoinColumn({ name: "staff_account_id" })
  account: StaffAccountEntity | null = null
}
