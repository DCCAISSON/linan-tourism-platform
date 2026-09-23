import type { NotificationDeliveryStatus, NotificationTarget } from "./notifications.types"

export type NotificationPreviewSelection = {
  readonly sessionId: string
  readonly authorizationIds: readonly string[]
  readonly fingerprint: string
}

type RetryableTarget = { readonly status: NotificationDeliveryStatus }
type LabeledTarget = Pick<NotificationTarget, "id" | "receiverName">

export function createNotificationPreviewSelection(sessionId: string, authorizationIds: readonly string[]): NotificationPreviewSelection {
  const ids = [...authorizationIds]
  return { sessionId, authorizationIds: ids, fingerprint: targetFingerprint(sessionId, ids) }
}

export function isNotificationPreviewCurrent(selection: NotificationPreviewSelection | null, sessionId: string, authorizationIds: readonly string[]): boolean {
  return selection !== null && selection.fingerprint === targetFingerprint(sessionId, authorizationIds)
}

export function canRetryNotificationTargets(targets: readonly RetryableTarget[]): boolean {
  return targets.some(target => target.status === "retryable_failed")
}

export function notificationAttemptTargetLabel(targetId: string, targets: readonly LabeledTarget[]): string {
  const target = targets.find(item => item.id === targetId)
  return target === undefined ? targetId : `${target.receiverName} · ${targetId}`
}

function targetFingerprint(sessionId: string, authorizationIds: readonly string[]): string {
  return `${sessionId}\n${authorizationIds.join("\n")}`
}
