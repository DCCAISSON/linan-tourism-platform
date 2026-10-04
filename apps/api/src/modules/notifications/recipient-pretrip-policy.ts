import type { UserNotificationTemplateEntity } from "../../domain/entities/user-notification.entity.js"
import type { NotificationRecipientAuthorizationEntity } from "../../domain/entities/notification-recipient-authorization.entity.js"
import type { NotificationChannelEntryEntity } from "../../domain/entities/notification-channel-entry.entity.js"

const safeFields: Readonly<Record<string, "thing" | "time">> = {
  活动名称: "thing", 活动时间: "time", 集合时间: "time", 集合地点: "thing", 通知内容: "thing",
}

export function isRecipientPretripTemplate(template: UserNotificationTemplateEntity): boolean {
  return template.enabled && template.category === "activity" && template.type === "once" && template.fields.length > 0
    && template.fields.every(field => safeFields[field.label] === field.rule && new RegExp(`^${field.rule}\\d+$`).test(field.key))
}

export function recipientAuthorizationIsCurrent(row: NotificationRecipientAuthorizationEntity, now = Date.now()): boolean {
  return row.active && row.revokedAt === null && row.expiresAt !== null && row.expiresAt.getTime() > now
}

export function availableContactEntry(row: NotificationChannelEntryEntity): boolean {
  if (!row.enabled) return false
  try {
    const url = new URL(row.url)
    if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return false
    if (row.kind === "enterprise_wechat") return typeof row.corpId === "string" && /^[A-Za-z0-9_-]{5,64}$/.test(row.corpId) && url.hostname === "work.weixin.qq.com" && /^\/kfid\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
    return row.kind === "official_account" && url.hostname === "mp.weixin.qq.com" && /^\/s(?:\/|$)/.test(url.pathname)
  } catch { return false }
}

export function safeRecipientTemplateData(template: UserNotificationTemplateEntity, input: { title: string; startsAt: Date; gatheringAt: Date | null; gatheringPlace: string }) {
  if (!isRecipientPretripTemplate(template)) return null
  const data: Record<string, { value: string }> = {}
  for (const field of template.fields) {
    if (field.label === "集合时间" && input.gatheringAt === null) return null
    const value = field.label === "活动名称" ? input.title
      : field.label === "活动时间" ? chinaTime(input.startsAt)
      : field.label === "集合时间" ? chinaTime(input.gatheringAt ?? input.startsAt)
      : field.label === "集合地点" ? input.gatheringPlace
      : "行前安排已更新，请查看"
    if (value.trim().length === 0) return null
    data[field.key] = { value: field.rule === "thing" ? [...value].slice(0, 20).join("") : value }
  }
  return data
}

function chinaTime(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(value)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? ""
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`
}
