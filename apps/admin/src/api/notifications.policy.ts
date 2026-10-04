import type { NotificationDeliveryStatus, NotificationTarget } from "./notifications.types"
import type { UserMessageDetail } from "./user-notifications"

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

export function userNotificationAttemptGuidance(attempt: UserMessageDetail["attempts"][number]): string {
  switch (attempt.errorCode) {
    case "43101": return "未订阅或无可用订阅次数，请本人重新同意订阅后再安排发送。"
    case "45009": return "发送次数受限，请稍后核对可用订阅次数后处理。"
    case "subscription_unavailable": return "当前订阅授权或模板已不可用，本次未发送；请重新核对当前授权和模板。"
    case "40003": return "接收人标识无效，请联系管理员核对该用户的小程序身份。"
    case "40037": return "消息模板无效，请联系管理员核对模板是否属于当前小程序。"
    case "47003": return "消息内容不符合模板要求，请核对字段类型、长度和格式。"
  }
  const guidance = {
    api_accepted: "微信接口已受理，请以本人手机实际收到为准。",
    rejected: "发送未被受理，请联系管理员核对错误码后处理。",
    unknown: "发送结果尚未确认，请人工核对，不要直接重复发送。",
    blocked: "本次已阻止发送，请联系管理员核对当前订阅授权和模板。",
  } satisfies Record<typeof attempt.status, string>
  return guidance[attempt.status]
}

function targetFingerprint(sessionId: string, authorizationIds: readonly string[]): string {
  return `${sessionId}\n${authorizationIds.join("\n")}`
}
