import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"
import type { BusinessCategory, BusinessMedia, BusinessStatus } from "../../modules/business/business.types.js"
@Entity({ name: "business_products" })
@Index("idx_business_products_org", ["organizationId"])
export class BusinessProductEntity {
  @PrimaryColumn({ type: "varchar", length: 64 }) id = ""
  @Column({ name: "organization_id", type: "varchar", length: 64 }) organizationId = ""
  @Column({ type: "varchar", length: 24 }) category: BusinessCategory = "tourism"
  @Column({ type: "varchar", length: 160 }) title = ""
  @Column({ type: "varchar", length: 500 }) offering = ""
  @Column({ type: "text" }) content = ""
  @Column({ name: "reference_price_fen", type: "int", nullable: true }) referencePriceFen: number | null = null
  @Column({ name: "customer_service_phone", type: "varchar", length: 32 }) customerServicePhone = ""
  @Column({ name: "booking_url", type: "varchar", length: 2048 }) bookingUrl = ""
  @Column({ name: "booking_authorized", type: "boolean" }) bookingAuthorized = false
  @Column({ type: "json" }) media: BusinessMedia[] = []
  @Column({ name: "media_authorized", type: "boolean" }) mediaAuthorized = false
  @Column({ type: "varchar", length: 24 }) status: BusinessStatus = "draft"
  @Column({ type: "int", default: 1 }) version = 1
  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 }) createdAt = new Date(0)
  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 }) updatedAt = new Date(0)
}
