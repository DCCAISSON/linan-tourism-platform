import { Column, CreateDateColumn, Entity, ForeignKey, Index, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm"
import { StaffAccountEntity } from "./staff-account.entity.js"

@Entity({ name: "staff_account_permissions" })
@Index("idx_staff_account_permissions_account", ["staffAccountId"])
@Index("idx_staff_account_permissions_unique", ["staffAccountId", "permissionKey"], { unique: true })
export class StaffAccountPermissionEntity {
  @PrimaryColumn({ type: "varchar", length: 80 })
  id = ""

  @ForeignKey(() => StaffAccountEntity, {
    name: "fk_staff_account_permissions_account",
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  })
  @Column({ name: "staff_account_id", type: "varchar", length: 64 })
  staffAccountId = ""

  @Column({ name: "permission_key", type: "varchar", length: 64 })
  permissionKey = ""

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)

  @ManyToOne(() => StaffAccountEntity, (account) => account.permissions, { createForeignKeyConstraints: false })
  @JoinColumn({ name: "staff_account_id" })
  account: StaffAccountEntity | null = null
}
