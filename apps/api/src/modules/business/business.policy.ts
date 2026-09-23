import { ForbiddenException } from "@nestjs/common"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
export type BusinessPermission = "business.read" | "business.write" | "business.followup"
export function assertBusinessAccess(access: StaffAccess, permission: BusinessPermission, organizationId?: string): void {
  if (![...access.permissionKeys].some(key => key === permission) ||
    !access.scopes.some(scope => scope.kind === "all" || (organizationId !== undefined && (scope.kind === "organization" || scope.kind === "school") && scope.id === organizationId))) {
    throw new ForbiddenException({ code: "business_scope_forbidden", message: "无权访问该机构业务" })
  }
}
export function businessOrganizationIds(access: StaffAccess, permission: BusinessPermission): readonly string[] | null {
  if (![...access.permissionKeys].some(key => key === permission)) throw new ForbiddenException({ code: "business_scope_forbidden", message: "缺少业务权限" })
  if (access.scopes.some(scope => scope.kind === "all")) return null
  return access.scopes.filter(scope => scope.kind === "organization" || scope.kind === "school").flatMap(scope => scope.id === null ? [] : [scope.id])
}
