import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm"

@Entity({ name: "catalog_content_templates" })
export class CatalogContentTemplateEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @Column({ type: "varchar", length: 160 })
  title = ""

  @Column({ type: "varchar", length: 4000, default: "" })
  description = ""

  @Column({ name: "cover_image_url", type: "varchar", length: 2048, default: "" })
  coverImageUrl = ""

  @Column({ type: "int", unsigned: true, default: 1 })
  version = 1

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
