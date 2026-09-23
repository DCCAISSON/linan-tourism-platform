import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"
import { FamilyEntity } from "./family.entity.js"
import { OrganizationEntity } from "./organization.entity.js"

@Entity({ name: "wechat_family_sessions" })
@Index("uq_wechat_family_sessions_token_hash", ["tokenHash"], { unique: true })
@Index("idx_wechat_family_sessions_openid_hash", ["openidHash"])
@Index("idx_wechat_family_sessions_family", ["familyId"])
export class WechatFamilySessionEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => OrganizationEntity, { name: "fk_wechat_family_sessions_organization", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "organization_id", type: "varchar", length: 64 })
  organizationId = ""

  @ForeignKey(() => FamilyEntity, { name: "fk_wechat_family_sessions_family", onDelete: "RESTRICT", onUpdate: "CASCADE" })
  @Column({ name: "family_id", type: "varchar", length: 64 })
  familyId = ""

  @Column({ name: "family_code", type: "varchar", length: 64 })
  familyCode = ""

  @Column({ name: "openid_hash", type: "char", length: 64 })
  openidHash = ""

  @Column({ name: "unionid_hash", type: "char", length: 64, nullable: true })
  unionidHash: string | null = null

  @Column({ name: "token_hash", type: "char", length: 64 })
  tokenHash = ""

  @Column({ name: "expires_at", type: "datetime", precision: 6 })
  expiresAt = new Date(0)

  @Column({ name: "revoked_at", type: "datetime", precision: 6, nullable: true })
  revokedAt: Date | null = null

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
