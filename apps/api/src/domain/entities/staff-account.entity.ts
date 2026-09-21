import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryColumn, UpdateDateColumn } from "typeorm"
import { StaffAccountPermissionEntity } from "./staff-account-permission.entity.js"
import { StaffAccountScopeEntity } from "./staff-account-scope.entity.js"

@Entity({ name: "staff_accounts" })
@Index("idx_staff_accounts_username", ["username"], { unique: true })
export class StaffAccountEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @Column({ type: "varchar", length: 80 })
  username = ""

  @Column({ name: "display_name", type: "varchar", length: 80 })
  displayName = ""

  @Column({ name: "password_hash", type: "varchar", length: 255 })
  passwordHash = ""

  @Column({ type: "varchar", length: 24 })
  status: "active" | "disabled" = "active"

  @Column({ name: "force_password_change", type: "boolean", default: true })
  forcePasswordChange = true

  @Column({ name: "failed_login_attempts", type: "int", default: 0 })
  failedLoginAttempts = 0

  @Column({ name: "locked_until", type: "datetime", precision: 6, nullable: true })
  lockedUntil: Date | null = null

  @Column({ name: "expires_at", type: "datetime", precision: 6, nullable: true })
  expiresAt: Date | null = null

  @Column({ name: "permissions_version", type: "int", default: 1 })
  permissionsVersion = 1

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)

  @OneToMany(() => StaffAccountPermissionEntity, (permission) => permission.account)
  permissions?: StaffAccountPermissionEntity[]

  @OneToMany(() => StaffAccountScopeEntity, (scope) => scope.account)
  scopes?: StaffAccountScopeEntity[]
}
