import { In, type EntityManager } from "typeorm"
import { BusinessInquiryCustomerLinkEntity } from "../../domain/entities/business-inquiry-customer-link.entity.js"
import { CrmCustomerEntity } from "../../domain/entities/crm-customer.entity.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { assertCrmPermission, assertCrmScope } from "../crm/crm.access.js"
import { assertBusinessAccess } from "./business.policy.js"

export function assertInquiryCustomerAccess(access: StaffAccess, organizationId: string, write: boolean): void {
  assertBusinessAccess(access, "business.followup", organizationId)
  assertCrmPermission(access, "crm.read")
  assertCrmScope(access, organizationId)
  if (write) assertCrmPermission(access, "crm.write")
}

export async function inquiryCustomerHistory(manager: EntityManager, inquiryId: string) {
  const events = await manager.find(BusinessInquiryCustomerLinkEntity, { where: { inquiryId }, order: { inquiryVersion: "ASC", action: "DESC" } })
  const ids = [...new Set(events.map(event => event.customerId))]
  const customers = ids.length ? await manager.findBy(CrmCustomerEntity, { id: In(ids) }) : []
  return events.map(event => ({ id: event.id, customerId: event.customerId, displayName: customers.find(customer => customer.id === event.customerId)?.displayName ?? "客户", action: event.action, actorId: event.actorId, createdAt: event.createdAt, inquiryVersion: event.inquiryVersion }))
}
