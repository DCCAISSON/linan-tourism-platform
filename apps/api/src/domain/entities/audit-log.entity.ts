import { DOMAIN_POLICY_VERSION } from "@linan/contracts"
import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm"
import { OrganizationEntity } from "./organization.entity.js"

@Entity({ name: "audit_logs" })
@Index("idx_audit_logs_target", ["targetType", "targetId"])
@Index("idx_audit_logs_organization", ["organizationId"])
export class AuditLogEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => OrganizationEntity, {
    name: "fk_audit_logs_organization",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "organization_id", type: "varchar", length: 64 })
  organizationId = ""

  @Column({ name: "actor_id", type: "varchar", length: 64 })
  actorId = ""

  @Column({ type: "varchar", length: 64 })
  action = ""

  @Column({ name: "target_type", type: "varchar", length: 64 })
  targetType = ""

  @Column({ name: "target_id", type: "varchar", length: 64 })
  targetId = ""

  @Column({ name: "policy_version", type: "varchar", length: 64 })
  policyVersion = DOMAIN_POLICY_VERSION

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)
}
