import { createHash } from "node:crypto"
import type { NotificationDeliveryStatus, NotificationDeliveryTaskStatus } from "../../domain/entities/notification-delivery.entity.js"
import type { NotificationDispatchMode } from "./notifications.types.js"

export function notificationTaskFingerprint(contentVersionId: string, authorizationIds: readonly string[], sourceId?: string): string {
  return createHash("sha256").update(JSON.stringify({ contentVersionId, authorizationIds: [...authorizationIds].sort(), ...(sourceId === undefined ? {} : { sourceId }) })).digest("hex")
}

export function canDispatchTarget(mode: NotificationDispatchMode, status: NotificationDeliveryStatus): boolean {
  switch (mode) {
    case "initial": return status === "pending"
    case "retry": return status === "retryable_failed"
  }
}

export function isAuthorizationCurrent(active: boolean, currentVersion: number, targetVersion: number): boolean {
  return active && currentVersion === targetVersion
}

export function summarizeTaskStatus(statuses: readonly NotificationDeliveryStatus[]): NotificationDeliveryTaskStatus {
  if (statuses.some((status) => status === "manual_required")) return "manual_required"
  if (statuses.some((status) => status === "retryable_failed")) return "retryable_failed"
  if (statuses.some((status) => status === "pending")) return "pending"
  return "completed"
}
