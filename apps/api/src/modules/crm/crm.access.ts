import { ForbiddenException, NotFoundException } from "@nestjs/common"
import type { EntityManager } from "typeorm"
import { FamilyEntity } from "../../domain/entities/family.entity.js"
import { StaffAccountEntity } from "../../domain/entities/staff-account.entity.js"
import { StaffAccountPermissionEntity } from "../../domain/entities/staff-account-permission.entity.js"
import { StaffAccountScopeEntity } from "../../domain/entities/staff-account-scope.entity.js"
import { CrmCustomerEntity } from "../../domain/entities/crm-customer.entity.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import type { StaffPermissionKey } from "../iam/staff-permissions.js"
import type { CrmMetadata } from "./crm.types.js"

export function assertCrmPermission(access: StaffAccess, permission: StaffPermissionKey): void {
  if (!access.permissionKeys.has(permission)) throw crmForbidden()
}
export function crmScopeAllowed(access: StaffAccess, organizationId: string): boolean {
  return access.scopes.some((scope) => scope.kind === "all" || ((scope.kind === "organization" || scope.kind === "school") && scope.id === organizationId))
}
export function assertCrmScope(access: StaffAccess, organizationId: string): void {
  if (!crmScopeAllowed(access, organizationId)) throw crmForbidden()
}
export function crmForbidden(): ForbiddenException { return new ForbiddenException({ code: "crm_scope_forbidden", message: "没有该客户资料的操作权限" }) }
export async function scopedCustomer(manager: EntityManager, access: StaffAccess, id: string, lock = false): Promise<CrmCustomerEntity> {
  const customer = await manager.findOne(CrmCustomerEntity, { where: { id }, ...(lock ? { lock: { mode: "pessimistic_write" } } : {}) })
  if (customer === null) throw new NotFoundException({ code: "crm_not_found", message: "客户不存在" })
  assertCrmScope(access, customer.organizationId)
  return customer
}
export async function validateCrmLinks(manager: EntityManager, organizationId: string, input: CrmMetadata): Promise<void> {
  if (input.familyId !== null) {
    const family = await manager.findOneBy(FamilyEntity, { id: input.familyId, organizationId })
    if (family === null) throw crmForbidden()
  }
  if (input.ownerId !== null && !await validCrmOwner(manager, organizationId, input.ownerId)) throw crmForbidden()
}
export async function validCrmOwner(manager: EntityManager, organizationId: string, id: string): Promise<boolean> {
  const account = await manager.findOneBy(StaffAccountEntity, { id, status: "active" })
  if (account === null || (account.expiresAt !== null && account.expiresAt <= new Date())) return false
  const permission = await manager.findOneBy(StaffAccountPermissionEntity, { staffAccountId: id, permissionKey: "crm.write" })
  if (permission === null) return false
  const scopes = await manager.findBy(StaffAccountScopeEntity, { staffAccountId: id })
  return scopes.some((scope) => scope.scopeKind === "all" || ((scope.scopeKind === "school" || scope.scopeKind === "organization") && scope.scopeId === organizationId))
}
export function crmCustomerResponse(customer: CrmCustomerEntity) {
  return {
    id: customer.id, organizationId: customer.organizationId, displayName: customer.displayName,
    phoneMasked: customer.phoneMasked, source: customer.source, tags: customer.tags,
    marketingConsent: customer.marketingConsent, ownerId: customer.ownerId, familyId: customer.familyId,
    nextFollowupAt: customer.nextFollowupAt?.toISOString() ?? null, version: customer.version,
    createdAt: customer.createdAt.toISOString(), updatedAt: customer.updatedAt.toISOString(),
  }
}
