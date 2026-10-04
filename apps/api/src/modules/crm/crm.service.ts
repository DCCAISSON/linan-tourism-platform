import { createHash, randomUUID } from "node:crypto"
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import { CrmCustomerEntity } from "../../domain/entities/crm-customer.entity.js"
import { CrmFollowupEntity } from "../../domain/entities/crm-followup.entity.js"
import { OrganizationEntity } from "../../domain/entities/organization.entity.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { decryptPersonValue, protectPhoneData } from "../enrollment/person-data.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { assertCrmPermission, assertCrmScope, crmCustomerResponse, scopedCustomer, validateCrmLinks } from "./crm.access.js"
import type { CrmFollowupInput, CrmUpdate, NewCrmCustomer } from "./crm.types.js"

@Injectable()
export class CrmService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
  ) {}
  async create(access: StaffAccess, input: NewCrmCustomer) {
    assertCrmPermission(access, "crm.write")
    assertCrmScope(access, input.organizationId)
    return (await this.database.getDataSource()).transaction(async (manager) => {
      const organization = await manager.findOne(OrganizationEntity, { where: { id: input.organizationId }, lock: { mode: "pessimistic_write" } })
      if (organization === null) throw new NotFoundException("业务范围不存在")
      const requestHash = fingerprint(input)
      const prior = await manager.findOneBy(CrmCustomerEntity, { organizationId: input.organizationId, requestKey: input.idempotencyKey })
      if (prior !== null) {
        assertSameRequest(prior.requestHash, requestHash)
        return crmCustomerResponse(prior)
      }
      await validateCrmLinks(manager, input.organizationId, input)
      const protectedPhone = protectPhoneData(input.phone)
      const customer = manager.create(CrmCustomerEntity, {
        id: `crm-${randomUUID()}`, organizationId: input.organizationId, displayName: input.displayName,
        birthDate: input.birthDate, adultConfirmedBy: access.actorId, phoneCiphertext: protectedPhone.phoneCiphertext,
        phoneMasked: protectedPhone.phoneMasked, personDataKeyVersion: protectedPhone.keyVersion,
        source: input.source, tags: [...input.tags], marketingConsent: input.marketingConsent,
        ownerId: input.ownerId, familyId: input.familyId, requestKey: input.idempotencyKey, requestHash,
      })
      await manager.save(customer)
      await this.audit.record(manager, { organizationId: customer.organizationId, actorId: access.actorId, action: `crm.created.consent.${customer.marketingConsent}`, targetType: "crm_customer", targetId: customer.id })
      return crmCustomerResponse(customer)
    })
  }
  async update(access: StaffAccess, id: string, input: CrmUpdate) {
    assertCrmPermission(access, "crm.write")
    return (await this.database.getDataSource()).transaction(async (manager) => {
      const customer = await scopedCustomer(manager, access, id, true)
      if (customer.version !== input.expectedVersion) throw new ConflictException({ code: "crm_stale_version", message: "资料已变更，请刷新后重试" })
      await validateCrmLinks(manager, customer.organizationId, input)
      Object.assign(customer, { displayName: input.displayName, source: input.source, tags: [...input.tags], marketingConsent: input.marketingConsent, ownerId: input.ownerId, familyId: input.familyId, version: customer.version + 1 })
      await manager.save(customer)
      await this.audit.record(manager, { organizationId: customer.organizationId, actorId: access.actorId, action: `crm.updated.consent.${customer.marketingConsent}`, targetType: "crm_customer", targetId: customer.id })
      return crmCustomerResponse(customer)
    })
  }
  async followup(access: StaffAccess, id: string, input: CrmFollowupInput) {
    assertCrmPermission(access, "crm.write")
    return (await this.database.getDataSource()).transaction(async (manager) => {
      const customer = await scopedCustomer(manager, access, id, true)
      const requestHash = fingerprint(input)
      const prior = await manager.findOneBy(CrmFollowupEntity, { customerId: id, requestKey: input.idempotencyKey })
      if (prior !== null) {
        assertSameRequest(prior.requestHash, requestHash)
        return { id: prior.id }
      }
      const followup = manager.create(CrmFollowupEntity, { id: `crf-${randomUUID()}`, customerId: id, content: input.content, nextFollowupAt: input.nextFollowupAt, createdBy: access.actorId, requestKey: input.idempotencyKey, requestHash })
      await manager.save(followup)
      customer.nextFollowupAt = input.nextFollowupAt
      customer.version += 1
      await manager.save(customer)
      await this.audit.record(manager, { organizationId: customer.organizationId, actorId: access.actorId, action: "crm.followup.created", targetType: "crm_followup", targetId: followup.id })
      return { id: followup.id }
    })
  }
  async contact(access: StaffAccess, id: string) {
    assertCrmPermission(access, "crm.read")
    assertCrmPermission(access, "crm.contact.read")
    assertCrmPermission(access, "sensitive_data.read")
    return (await this.database.getDataSource()).transaction(async (manager) => {
      const customer = await scopedCustomer(manager, access, id)
      const phone = decryptPersonValue(customer.phoneCiphertext, customer.personDataKeyVersion)
      await this.audit.record(manager, { organizationId: customer.organizationId, actorId: access.actorId, action: "crm.contact.read", targetType: "crm_customer", targetId: customer.id })
      return { phone }
    })
  }
}
function fingerprint(input: NewCrmCustomer | CrmFollowupInput): string { return createHash("sha256").update(JSON.stringify(input)).digest("hex") }
function assertSameRequest(prior: string, current: string): void {
  if (prior !== current) throw new ConflictException({ code: "crm_idempotency_conflict", message: "重复请求内容不同，请重新提交" })
}
