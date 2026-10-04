import { Inject, Injectable } from "@nestjs/common"
import { In } from "typeorm"
import { BusinessInquiryEntity } from "../../domain/entities/business-inquiry.entity.js"
import { BusinessInquiryCustomerLinkEntity } from "../../domain/entities/business-inquiry-customer-link.entity.js"
import { BusinessFollowupEntity } from "../../domain/entities/business-followup.entity.js"
import { BusinessProductEntity } from "../../domain/entities/business-product.entity.js"
import { CrmCustomerEntity } from "../../domain/entities/crm-customer.entity.js"
import { CrmFollowupEntity } from "../../domain/entities/crm-followup.entity.js"
import { OrganizationEntity } from "../../domain/entities/organization.entity.js"
import { FamilyEntity } from "../../domain/entities/family.entity.js"
import { StaffAccountEntity } from "../../domain/entities/staff-account.entity.js"
import { OrderEntity } from "../../domain/entities/order.entity.js"
import { EnrollmentEntity } from "../../domain/entities/enrollment.entity.js"
import { TourSessionEntity } from "../../domain/entities/tour-session.entity.js"
import { CatalogItemEntity } from "../../domain/entities/catalog-item.entity.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { assertCrmPermission, assertCrmScope, crmCustomerResponse, crmScopeAllowed, scopedCustomer, validCrmOwner } from "./crm.access.js"
import type { CrmFilters } from "./crm.types.js"

@Injectable()
export class CrmReadService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
  ) {}
  async organizations(access: StaffAccess) {
    assertCrmPermission(access, "crm.read")
    const manager = (await this.database.getDataSource()).manager
    const organizations = await manager.find(OrganizationEntity, { order: { name: "ASC" } })
    return organizations.filter((item) => crmScopeAllowed(access, item.id)).map(({ id, name }) => ({ id, name }))
  }
  async options(access: StaffAccess, organizationId: string) {
    assertCrmPermission(access, "crm.read")
    assertCrmScope(access, organizationId)
    const manager = (await this.database.getDataSource()).manager
    const families = await manager.find(FamilyEntity, { where: { organizationId }, order: { code: "ASC" } })
    const accounts = await manager.find(StaffAccountEntity, { where: { status: "active" }, order: { displayName: "ASC" } })
    const owners: { id: string; displayName: string }[] = []
    for (const account of accounts) if (await validCrmOwner(manager, organizationId, account.id)) owners.push({ id: account.id, displayName: account.displayName })
    return { families: families.map(({ id, code, primaryContactName }) => ({ id, code, primaryContactName })), owners }
  }
  async list(access: StaffAccess, filters: CrmFilters, exportRows = false) {
    assertCrmPermission(access, "crm.read")
    assertCrmScope(access, filters.organizationId)
    if (exportRows) assertCrmPermission(access, "crm.export")
    const manager = (await this.database.getDataSource()).manager
    const query = manager.createQueryBuilder(CrmCustomerEntity, "customer").where("customer.organizationId = :organizationId", { organizationId: filters.organizationId })
    if (filters.keyword !== "") query.andWhere("(LOCATE(:keyword, customer.displayName) > 0 OR LOCATE(:keyword, customer.source) > 0)", { keyword: filters.keyword })
    if (filters.tag !== "") query.andWhere("JSON_CONTAINS(customer.tags, :tag)", { tag: JSON.stringify(filters.tag) })
    if (filters.ownerId !== "") query.andWhere("customer.ownerId = :ownerId", { ownerId: filters.ownerId })
    if (filters.marketingConsent !== "") query.andWhere("customer.marketingConsent = :consent", { consent: filters.marketingConsent })
    if (filters.dueOnly) query.andWhere("customer.nextFollowupAt <= :now", { now: new Date() })
    query.orderBy("customer.updatedAt", "DESC").addOrderBy("customer.id", "ASC")
    if (!exportRows) query.skip((filters.page - 1) * 20).take(20)
    const [customers, total] = await query.getManyAndCount()
    return { customers: customers.map(crmCustomerResponse), total, page: filters.page, pageSize: 20 }
  }
  async detail(access: StaffAccess, id: string) {
    assertCrmPermission(access, "crm.read")
    const manager = (await this.database.getDataSource()).manager
    const customer = await scopedCustomer(manager, access, id)
    const followups = await manager.find(CrmFollowupEntity, { where: { customerId: id }, order: { createdAt: "DESC" } })
    const canReadInquiries = access.permissionKeys.has("business.followup")
    const links = canReadInquiries ? await manager.find(BusinessInquiryCustomerLinkEntity, { where: { customerId: id }, order: { inquiryVersion: "ASC", action: "DESC" } }) : []
    const inquiryIds = [...new Set(links.map(link => link.inquiryId))]
    const inquiries = inquiryIds.length ? await manager.find(BusinessInquiryEntity, { where: { id: In(inquiryIds), organizationId: customer.organizationId }, order: { createdAt: "DESC" } }) : []
    const inquiryFollowups = inquiries.length ? await manager.find(BusinessFollowupEntity, { where: { inquiryId: In(inquiries.map(inquiry => inquiry.id)) }, order: { createdAt: "ASC" } }) : []
    const products = inquiries.length ? await manager.findBy(BusinessProductEntity, { id: In(inquiries.map(inquiry => inquiry.productId)), organizationId: customer.organizationId }) : []
    return { ...crmCustomerResponse(customer), inquiries: inquiries.map(inquiry => ({ id: inquiry.id, productTitle: products.find(product => product.id === inquiry.productId)?.title ?? "业务咨询", request: inquiry.request, status: inquiry.status, linked: inquiry.customerId === id, createdAt: inquiry.createdAt.toISOString(),
      history: inquiryFollowups.filter(item => item.inquiryId === inquiry.id).map(item => ({ id: item.id, note: item.note, status: item.status, createdAt: item.createdAt.toISOString() })),
      customerHistory: links.filter(item => item.inquiryId === inquiry.id).map(item => ({ id: item.id, action: item.action, actorId: item.actorId, createdAt: item.createdAt.toISOString() })),
    })), followups: followups.map((item) => ({ id: item.id, content: item.content, nextFollowupAt: item.nextFollowupAt?.toISOString() ?? null, createdBy: item.createdBy, createdAt: item.createdAt.toISOString() })) }
  }
  async history(access: StaffAccess, id: string) {
    assertCrmPermission(access, "crm.read")
    assertCrmPermission(access, "orders.read")
    const manager = (await this.database.getDataSource()).manager
    const customer = await scopedCustomer(manager, access, id)
    if (customer.familyId === null) return []
    const enrollments = await manager.find(EnrollmentEntity, { where: { familyId: customer.familyId, organizationId: customer.organizationId } })
    const result: { orderId: string; code: string; status: string; paidFen: number; participantCount: number; activityTitle: string; startsAt: string }[] = []
    for (const enrollment of enrollments) {
      const order = await manager.findOneBy(OrderEntity, { enrollmentId: enrollment.id, organizationId: customer.organizationId })
      const session = await manager.findOneBy(TourSessionEntity, { id: enrollment.tourSessionId, organizationId: customer.organizationId })
      if (order === null || session === null) continue
      const catalog = await manager.findOneBy(CatalogItemEntity, { id: session.catalogItemId })
      result.push({ orderId: order.id, code: order.code, status: order.status, paidFen: order.paidFen, participantCount: enrollment.participantCount, activityTitle: catalog?.title ?? "活动", startsAt: session.startsAt.toISOString() })
    }
    return result.sort((a, b) => b.startsAt.localeCompare(a.startsAt))
  }
  async export(access: StaffAccess, filters: CrmFilters): Promise<string> {
    const result = await this.list(access, filters, true)
    await this.audit.record((await this.database.getDataSource()).manager, { organizationId: filters.organizationId, actorId: access.actorId, action: "crm.export.masked", targetType: "crm_organization", targetId: filters.organizationId })
    const rows = [["客户姓名", "脱敏电话", "来源", "人工标签", "营销授权", "下次跟进"], ...result.customers.map((customer) => [customer.displayName, customer.phoneMasked, customer.source, customer.tags.join("、"), customer.marketingConsent, customer.nextFollowupAt ?? ""])]
    return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n")
  }
}
export function csvCell(value: string): string {
  const safe = /^[\s]*[=+@-]/.test(value) ? `'${value}` : value
  return `"${safe.replaceAll('"', '""')}"`
}
