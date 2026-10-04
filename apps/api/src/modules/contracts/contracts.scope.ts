import { ForbiddenException } from "@nestjs/common"
import type { TourSessionEntity } from "../../domain/entities/index.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import type { StaffPermissionKey } from "../iam/staff-permissions.js"

export function assertContractPermission(access: StaffAccess, permission: StaffPermissionKey): void {
  if (!access.permissionKeys.has(permission)) throw denied()
}

export function assertContractSessionScope(access: StaffAccess, session: TourSessionEntity): void {
  if (!access.scopes.some((scope) => scope.kind === "all"
    || ((scope.kind === "school" || scope.kind === "organization") && scope.id === session.organizationId)
    || (scope.kind === "tour_session" && scope.id === session.id))) throw denied()
}

function denied(): ForbiddenException {
  return new ForbiddenException({ code: "staff_scope_forbidden", message: "无权查看或管理此合同" })
}
