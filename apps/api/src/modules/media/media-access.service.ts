import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import type { EntityManager } from "typeorm"
import { TourSessionEntity } from "../../domain/entities/tour-session.entity.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import type { EnrollmentIdentity } from "../enrollment/enrollment.types.js"
import { findScopedOrder } from "../order/order.persistence.js"
import { ExecutionAccessService } from "../execution/execution-access.service.js"

export type MediaPermission = "media.read" | "media.upload" | "media.publish" | "media.delete"

@Injectable()
export class MediaAccessService {
  constructor(@Inject(ExecutionAccessService) private readonly execution: ExecutionAccessService) {}

  async staffSession(manager: EntityManager, access: StaffAccess, sessionId: string, permission: MediaPermission): Promise<TourSessionEntity> {
    const session = await manager.findOneBy(TourSessionEntity, { id: sessionId })
    if (session === null || !mediaScopeMatches(access, session, permission)) throw forbidden()
    if (access.kind === "guide") await this.execution.assertAssigned(access, sessionId)
    return session
  }

  async sessions(manager: EntityManager, access: StaffAccess): Promise<readonly TourSessionEntity[]> {
    if (!access.permissionKeys.has("media.read")) throw forbidden()
    const sessions = await manager.find(TourSessionEntity, { order: { startsAt: "DESC" } })
    const assigned = access.kind === "guide" ? await this.execution.assignedSessionIds(access) : null
    return sessions.filter((session) => mediaScopeMatches(access, session, "media.read") && (assigned === null || assigned.includes(session.id)))
  }

  async familySession(manager: EntityManager, identity: EnrollmentIdentity, orderId: string): Promise<string> {
    try {
      const { order, enrollment } = await findScopedOrder(manager, identity, orderId)
      if (order.status !== "paid" || order.paidFen <= 0) throw forbidden()
      return enrollment.tourSessionId
    } catch (error) {
      if (error instanceof NotFoundException) throw forbidden()
      throw error
    }
  }
}

export function mediaScopeMatches(access: StaffAccess, session: TourSessionEntity, permission: MediaPermission): boolean {
  return access.permissionKeys.has(permission) && access.scopes.some((scope) => {
    if (scope.kind === "all") return true
    if (scope.kind === "organization" || scope.kind === "school") return scope.id === session.organizationId
    return scope.kind === "tour_session" && scope.id === session.id
  })
}

export function forbidden(): ForbiddenException {
  return new ForbiddenException({ code: "media_access_forbidden", message: "无权访问本团素材" })
}
