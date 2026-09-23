import { createHash } from "node:crypto"
import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import { In } from "typeorm"
import { BusinessInquiryEntity } from "../../domain/entities/business-inquiry.entity.js"
import { BusinessFollowupEntity } from "../../domain/entities/business-followup.entity.js"
import { StaffAccountEntity } from "../../domain/entities/staff-account.entity.js"
import { StaffAccountScopeEntity } from "../../domain/entities/staff-account-scope.entity.js"
import { StaffAccountPermissionEntity } from "../../domain/entities/staff-account-permission.entity.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { makeId } from "../configuration/configuration.persistence.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { assertBusinessAccess, businessOrganizationIds } from "./business.policy.js"
import type { FollowupInput } from "./business.types.js"

@Injectable()
export class BusinessInquiryService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
  ) {}
  async list(access: StaffAccess) {
    const ids = businessOrganizationIds(access, "business.followup")
    if (ids?.length === 0) return []
    const db = await this.database.getDataSource()
    const rows = await db.getRepository(BusinessInquiryEntity).find({ where: ids === null ? {} : { organizationId: In([...ids]) }, order: { createdAt: "DESC" }, take: 200 })
    return rows.map(({ requestHash: _requestHash, idempotencyKey: _key, phone, ...row }) => ({ ...row, phone: phone.slice(0, 3) + "****" + phone.slice(-4) }))
  }
  async detail(access: StaffAccess, id: string) {
    const db = await this.database.getDataSource()
    return db.transaction(async manager => {
      const inquiry = await manager.findOneBy(BusinessInquiryEntity, { id })
      if (!inquiry) throw new NotFoundException("咨询记录不存在")
      assertBusinessAccess(access, "business.followup", inquiry.organizationId)
      await this.audit.record(manager, { actorId: access.actorId, organizationId: inquiry.organizationId, action: "business.contact.read", targetType: "business_inquiry", targetId: id })
      const history = await manager.find(BusinessFollowupEntity, { where: { inquiryId: id }, order: { createdAt: "ASC" } })
      const { requestHash: _requestHash, idempotencyKey: _key, ...record } = inquiry
      return { ...record, history: history.map(({ requestHash: _hash, idempotencyKey: _replay, ...row }) => row) }
    })
  }
  async followup(access: StaffAccess, id: string, input: FollowupInput) {
    const db = await this.database.getDataSource()
    return db.transaction(async manager => {
      const inquiry = await manager.findOne(BusinessInquiryEntity, { where: { id }, lock: { mode: "pessimistic_write" } })
      if (!inquiry) throw new NotFoundException("咨询记录不存在")
      assertBusinessAccess(access, "business.followup", inquiry.organizationId)
      const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex")
      const replay = await manager.findOneBy(BusinessFollowupEntity, { inquiryId: id, idempotencyKey: input.idempotencyKey })
      if (replay) {
        if (replay.actorId !== access.actorId || replay.requestHash !== hash) throw new ConflictException("同一提交编号内容不一致")
        return { id: replay.id, version: inquiry.version }
      }
      if (inquiry.version !== input.expectedVersion) throw new ConflictException({ code: "business_stale", message: "咨询已变更，请刷新后跟进" })
      const owner = await manager.findOneBy(StaffAccountEntity, { id: input.ownerStaffAccountId, status: "active" })
      const permissions = await manager.findBy(StaffAccountPermissionEntity, { staffAccountId: input.ownerStaffAccountId })
      const scopes = await manager.findBy(StaffAccountScopeEntity, { staffAccountId: input.ownerStaffAccountId })
      if (!owner || (owner.expiresAt && owner.expiresAt.getTime() <= Date.now()) ||
        !permissions.some(row => row.permissionKey === "business.followup") ||
        !scopes.some(row => row.scopeKind === "all" || ((row.scopeKind === "organization" || row.scopeKind === "school") && row.scopeId === inquiry.organizationId))) {
        throw new ForbiddenException({ code: "business_owner_forbidden", message: "负责人须为本机构有业务跟进权限的有效员工" })
      }
      const followup = await manager.save(BusinessFollowupEntity, { ...input, id: makeId("followup"), inquiryId: id, requestHash: hash, actorId: access.actorId })
      inquiry.status = input.status
      inquiry.ownerStaffAccountId = input.ownerStaffAccountId
      inquiry.version += 1
      await manager.save(inquiry)
      await this.audit.record(manager, { actorId: access.actorId, organizationId: inquiry.organizationId, action: "business.inquiry.followup", targetType: "business_inquiry", targetId: id })
      return { id: followup.id, version: inquiry.version }
    })
  }
}
