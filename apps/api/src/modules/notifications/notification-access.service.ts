import { ORDER_STATUS, type OrderStatus } from "@linan/contracts"
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import type { EntityManager } from "typeorm"
import { TourSessionEntity } from "../../domain/entities/tour-session.entity.js"
import type { EnrollmentIdentity } from "../enrollment/enrollment.types.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { findScopedOrder, type ScopedOrder } from "../order/order.persistence.js"

export type NotificationPermission = "notifications.read" | "notifications.write" | "notifications.send"

@Injectable()
export class NotificationAccessService {
  async staffSession(manager: EntityManager, access: StaffAccess, sessionId: string, permission: NotificationPermission): Promise<TourSessionEntity> {
    const session = await manager.findOneBy(TourSessionEntity, { id: sessionId })
    if (session === null || !notificationScopeMatches(access, session, permission)) throw forbidden()
    return session
  }

  async familyOrder(manager: EntityManager, identity: EnrollmentIdentity, orderId: string): Promise<ScopedOrder> {
    try {
      const scoped = await findScopedOrder(manager, identity, orderId)
      if (!orderAllowsFamilyNotificationAccess(scoped.order.status, scoped.order.paidFen)) throw forbidden()
      return scoped
    } catch (error) {
      if (error instanceof NotFoundException) throw forbidden()
      throw error
    }
  }
}

export function orderAllowsFamilyNotificationAccess(status: OrderStatus, paidFen: number): boolean {
  return status === ORDER_STATUS.pendingPayment
    || status === ORDER_STATUS.paid && paidFen > 0
    || status === ORDER_STATUS.refunded && paidFen > 0
}

export function notificationScopeMatches(access: StaffAccess, session: TourSessionEntity, permission: NotificationPermission): boolean {
  return hasPermission(access.permissionKeys, permission) && access.scopes.some((scope) => {
    if (scope.kind === "all") return true
    if (scope.kind === "organization" || scope.kind === "school") return scope.id === session.organizationId
    return scope.kind === "tour_session" && scope.id === session.id
  })
}

function hasPermission<T extends string>(permissions: ReadonlySet<T>, expected: string): boolean {
  return Array.from(permissions).some((permission) => permission === expected)
}

function forbidden(): ForbiddenException {
  return new ForbiddenException({ code: "notification_access_forbidden", message: "无权访问本团通知" })
}
