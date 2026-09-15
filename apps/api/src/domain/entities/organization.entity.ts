import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"

@Entity({ name: "organizations" })
@Index("uq_organizations_code", ["code"], { unique: true })
export class OrganizationEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @Column({ type: "varchar", length: 64 })
  code = ""

  @Column({ type: "varchar", length: 120 })
  name = ""

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
