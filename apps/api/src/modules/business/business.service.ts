import { createHash } from "node:crypto"
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import { In } from "typeorm"
import { BusinessProductEntity } from "../../domain/entities/business-product.entity.js"
import { BusinessInquiryEntity } from "../../domain/entities/business-inquiry.entity.js"
import { OrganizationEntity } from "../../domain/entities/organization.entity.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { makeId } from "../configuration/configuration.persistence.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { assertBusinessAccess, businessOrganizationIds } from "./business.policy.js"
import type { BusinessCategory, InquiryInput, ProductInput } from "./business.types.js"

@Injectable()
export class BusinessService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
  ) {}
  async listPublic(category: BusinessCategory) {
    const db = await this.database.getDataSource()
    return db.getRepository(BusinessProductEntity).find({ where: { category, status: "published" }, order: { updatedAt: "DESC" }, take: 100 })
  }
  async getPublic(id: string) {
    const db = await this.database.getDataSource()
    const product = await db.getRepository(BusinessProductEntity).findOneBy({ id, status: "published" })
    if (!product) throw new NotFoundException({ code: "business_not_found", message: "内容尚未发布或已下架" })
    return product
  }
  async listStaff(access: StaffAccess) {
    const ids = businessOrganizationIds(access, "business.read")
    if (ids?.length === 0) return []
    const db = await this.database.getDataSource()
    return db.getRepository(BusinessProductEntity).find({ where: ids === null ? {} : { organizationId: In([...ids]) }, order: { updatedAt: "DESC" }, take: 200 })
  }
  async create(access: StaffAccess, input: ProductInput) {
    assertBusinessAccess(access, "business.write", input.organizationId)
    const db = await this.database.getDataSource()
    return db.transaction(async manager => {
      if (!await manager.existsBy(OrganizationEntity, { id: input.organizationId })) throw new NotFoundException("所属机构不存在")
      const product = await manager.save(BusinessProductEntity, { ...input, media: [...input.media], id: makeId("business") })
      await this.audit.record(manager, { actorId: access.actorId, organizationId: product.organizationId, action: "business.product.create", targetType: "business_product", targetId: product.id })
      return product
    })
  }
  async update(access: StaffAccess, id: string, input: ProductInput, expectedVersion: number) {
    const db = await this.database.getDataSource()
    return db.transaction(async manager => {
      const product = await manager.findOne(BusinessProductEntity, { where: { id }, lock: { mode: "pessimistic_write" } })
      if (!product) throw new NotFoundException("业务内容不存在")
      assertBusinessAccess(access, "business.write", product.organizationId)
      if (input.organizationId !== product.organizationId) throw new ConflictException("不能变更所属机构")
      if (product.version !== expectedVersion) throw new ConflictException({ code: "business_stale", message: "内容已变更，请刷新后编辑" })
      Object.assign(product, input, { media: [...input.media], version: product.version + 1 })
      await manager.save(product)
      await this.audit.record(manager, { actorId: access.actorId, organizationId: product.organizationId, action: "business.product.update", targetType: "business_product", targetId: product.id })
      return product
    })
  }
  async submitInquiry(productId: string, input: InquiryInput) {
    const db = await this.database.getDataSource()
    return db.transaction(async manager => {
      const product = await manager.findOne(BusinessProductEntity, { where: { id: productId, status: "published" }, lock: { mode: "pessimistic_write" } })
      if (!product) throw new NotFoundException({ code: "business_not_found", message: "内容尚未发布或已下架" })
      const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex")
      const existing = await manager.findOneBy(BusinessInquiryEntity, { productId, idempotencyKey: input.idempotencyKey })
      if (existing) {
        if (existing.requestHash !== requestHash) throw new ConflictException({ code: "business_replay_conflict", message: "同一提交编号内容不一致" })
        return { id: existing.id, status: "received" }
      }
      const inquiry = await manager.save(BusinessInquiryEntity, { ...input, id: makeId("inquiry"), productId, organizationId: product.organizationId, requestHash, status: "inquiry" })
      return { id: inquiry.id, status: "received" }
    })
  }
}
