import { ForbiddenException } from "@nestjs/common"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"

type Assignment = { readonly tourSessionId: string; readonly vehicleId: string | null; readonly active: boolean }

export function assertAssignmentAccess(assignments: readonly Assignment[], sessionId: string, vehicleId?: string): void {
  if (!assignments.some((row) => row.active && row.tourSessionId === sessionId && (vehicleId === undefined || row.vehicleId === vehicleId))) {
    throw executionForbidden("当前账号未获分配到此团期或车辆")
  }
}

export function hasSessionScope(access: StaffAccess, session: { readonly id: string; readonly organizationId: string }): boolean {
  return access.scopes.some((scope) => scope.kind === "all" ||
    (scope.kind === "tour_session" && scope.id === session.id) ||
    ((scope.kind === "organization" || scope.kind === "school") && scope.id === session.organizationId))
}

export function executionForbidden(message: string): ForbiddenException {
  return new ForbiddenException({ code: "execution_forbidden", message })
}
