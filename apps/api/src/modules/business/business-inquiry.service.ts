import { createHash } from "node:crypto"
import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import { In } from "typeorm"
import { BusinessInquiryEntity } from "../../domain/entities/business-inquiry.entity.js"
import { BusinessFollowupEntity } from "../../domain/entities/business-followup.entity.js"
import { BusinessProductEntity } from "../../domain/entities/business-product.entity.js"
import { StaffAccountEntity } from "../../domain/entities/staff-account.entity.js"
import { StaffAccountScopeEntity } from "../../domain/entities/staff-account-scope.entity.js"
import { StaffAccountPermissionEntity } from "../../domain/entities/staff-account-permission.entity.js"
import { CrmCustomerEntity } from "../../domain/entities/crm-customer.entity.js"
import { BusinessInquiryCustomerLinkEntity } from "../../domain/entities/business-inquiry-customer-link.entity.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { makeId } from "../configuration/configuration.persistence.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { assertBusinessAccess, businessOrganizationIds, isBusinessOwnerEligible } from "./business.policy.js"
import type { FollowupInput } from "./business.types.js"
import { assertInquiryCustomerAccess, inquiryCustomerHistory } from "./business-inquiry-links.js"

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
    return rows.map(({ requestHash: _requestHash, idempotencyKey: _key, customerId: _customerId, phone, ...row }) => ({ ...row, phone: phone.slice(0, 3) + "****" + phone.slice(-4) }))
  }
  async detail(access: StaffAccess, id: string) {
    const db = await this.database.getDataSource()
    return db.transaction(async manager => {
      const inquiry = await manager.findOneBy(BusinessInquiryEntity, { id })
      if (!inquiry) throw new NotFoundException("咨询记录不存在")
      assertBusinessAccess(access, "business.followup", inquiry.organizationId)
      await this.audit.record(manager, { actorId: access.actorId, organizationId: inquiry.organizationId, action: "business.contact.read", targetType: "business_inquiry", targetId: id })
      const history = await manager.find(BusinessFollowupEntity, { where: { inquiryId: id }, order: { createdAt: "ASC" } })
      const ownerIds = [...new Set([inquiry.ownerStaffAccountId, ...history.map(row => row.ownerStaffAccountId)].filter(value => value !== null))]
      const owners = ownerIds.length === 0 ? [] : await manager.findBy(StaffAccountEntity, { id: In(ownerIds) })
      const ownerName = (ownerId: string | null) => owners.find(owner => owner.id === ownerId)?.displayName ?? (ownerId === null ? "未分派" : "账号不可用")
      const product = await manager.findOneBy(BusinessProductEntity, { id: inquiry.productId, organizationId: inquiry.organizationId })
      const canReadCustomer = access.permissionKeys.has("crm.read")
      const customer = canReadCustomer && inquiry.customerId !== null ? await manager.findOneBy(CrmCustomerEntity, { id: inquiry.customerId, organizationId: inquiry.organizationId }) : null
      const customerHistory = canReadCustomer ? await inquiryCustomerHistory(manager, id) : []
      const { requestHash: _requestHash, idempotencyKey: _key, customerId: _customerId, ...record } = inquiry
      return { ...record, linkedCustomer: customer === null ? null : { id: customer.id, displayName: customer.displayName, phoneMasked: customer.phoneMasked }, customerHistory, productTitle: product?.title ?? "业务咨询", ownerDisplayName: ownerName(inquiry.ownerStaffAccountId), history: history.map(({ requestHash: _hash, idempotencyKey: _replay, ...row }) => ({ ...row, ownerDisplayName: ownerName(row.ownerStaffAccountId) })) }
    })
  }
  async customerCandidates(access: StaffAccess, id: string) {
    const manager = (await this.database.getDataSource()).manager
    const inquiry = await manager.findOneBy(BusinessInquiryEntity, { id })
    if (!inquiry) throw new NotFoundException("咨询记录不存在")
    assertInquiryCustomerAccess(access, inquiry.organizationId, false)
    const customers = await manager.find(CrmCustomerEntity, { where: { organizationId: inquiry.organizationId }, order: { displayName: "ASC", id: "ASC" } })
    return customers.map(({ id: customerId, displayName, phoneMasked }) => ({ id: customerId, displayName, phoneMasked }))
  }
  async linkCustomer(access: StaffAccess, id: string, input: { readonly customerId: string | null; readonly expectedVersion: number }) {
    const db = await this.database.getDataSource()
    return db.transaction(async manager => {
      const inquiry = await manager.findOne(BusinessInquiryEntity, { where: { id }, lock: { mode: "pessimistic_write" } })
      if (!inquiry) throw new NotFoundException("咨询记录不存在")
      assertInquiryCustomerAccess(access, inquiry.organizationId, true)
      if (inquiry.version !== input.expectedVersion) throw new ConflictException({ code: "business_stale", message: "咨询已变更，请刷新后关联" })
      if (input.customerId !== null && !await manager.findOneBy(CrmCustomerEntity, { id: input.customerId, organizationId: inquiry.organizationId })) {
        throw new NotFoundException("本机构客户不存在")
      }
      if (inquiry.customerId === input.customerId) return { id, version: inquiry.version }
      inquiry.version += 1
      for (const event of [{ customerId: inquiry.customerId, action: "unlinked" }, { customerId: input.customerId, action: "linked" }] as const) {
        if (event.customerId === null) continue
        const change = await manager.save(BusinessInquiryCustomerLinkEntity, { id: makeId("inqlink"), inquiryId: id, inquiryVersion: inquiry.version, actorId: access.actorId, customerId: event.customerId, action: event.action })
        await this.audit.record(manager, { actorId: access.actorId, organizationId: inquiry.organizationId, action: `business.inquiry.customer.${event.action}`, targetType: "business_inquiry_customer_link", targetId: change.id })
      }
      inquiry.customerId = input.customerId
      await manager.save(inquiry)
      return { id, version: inquiry.version }
    })
  }
  async owners(access: StaffAccess, id: string) {
    const manager = (await this.database.getDataSource()).manager
    const inquiry = await manager.findOneBy(BusinessInquiryEntity, { id })
    if (!inquiry) throw new NotFoundException("咨询记录不存在")
    assertBusinessAccess(access, "business.followup", inquiry.organizationId)
    const accounts = await manager.find(StaffAccountEntity, { where: { status: "active" }, order: { displayName: "ASC" } })
    if (accounts.length === 0) return []
    const ids = accounts.map(account => account.id)
    const [permissions, scopes] = await Promise.all([
      manager.findBy(StaffAccountPermissionEntity, { staffAccountId: In(ids), permissionKey: "business.followup" }),
      manager.findBy(StaffAccountScopeEntity, { staffAccountId: In(ids) }),
    ])
    return accounts.filter(account => isBusinessOwnerEligible(account, permissions.filter(row => row.staffAccountId === account.id), scopes.filter(row => row.staffAccountId === account.id), inquiry.organizationId))
      .map(({ id: ownerId, displayName }) => ({ id: ownerId, displayName }))
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
      if (!isBusinessOwnerEligible(owner, permissions, scopes, inquiry.organizationId)) {
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
