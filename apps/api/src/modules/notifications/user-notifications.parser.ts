import { BadRequestException, ForbiddenException } from "@nestjs/common"
import type { UserTemplateField } from "../../domain/entities/user-notification.entity.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import type { NotificationPermission } from "./notification-access.service.js"

export function assertUserNotificationAccess(access: StaffAccess, permission: NotificationPermission): void {
  if (!access.permissionKeys.has(permission) || !access.scopes.some(scope => scope.kind === "all")) {
    throw new ForbiddenException({ code: "user_notification_access_forbidden", message: "需要全局通知权限" })
  }
}

export function userRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalid()
  const result = Object.fromEntries(Object.entries(value))
  if (Object.keys(result).some(key => !keys.includes(key))) throw invalid()
  return result
}

export function userText(value: unknown, max = 128): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) throw invalid()
  return value.trim()
}

export function parseUserTemplate(value: unknown) {
  const input = userRecord(value, ["title", "category", "templateId", "type", "fields", "enabled"])
  if (input["type"] !== "once" || typeof input["enabled"] !== "boolean") throw invalid()
  const fields = input["fields"]
  if (!Array.isArray(fields) || fields.length < 1 || fields.length > 5) throw invalid()
  const parsed: UserTemplateField[] = fields.map((field: unknown) => {
    const item = userRecord(field, ["key", "label", "rule"])
    const key = userText(item["key"], 32)
    const rule = item["rule"]
    if (rule !== "thing" && rule !== "number" && rule !== "time") throw invalid()
    if (!new RegExp(`^${rule}[1-9][0-9]*$`).test(key)) throw invalid()
    return { key, label: userText(item["label"], 60), rule }
  })
  if (new Set(parsed.map(field => field.key)).size !== parsed.length) throw invalid()
  const templateId = userText(input["templateId"])
  if (!/^[A-Za-z0-9_-]+$/.test(templateId)) throw invalid()
  return { title: userText(input["title"], 120), category: userText(input["category"], 120), templateId,
    type: "once" as const, fields: parsed, enabled: input["enabled"] }
}

export function parseUserSubscription(value: unknown) {
  const input = userRecord(value, ["code", "outcomes"])
  const outcomes = input["outcomes"]
  if (!Array.isArray(outcomes) || outcomes.length < 1 || outcomes.length > 3) throw invalid()
  const parsed = outcomes.map((outcome: unknown) => {
    const item = userRecord(outcome, ["templateId", "result"])
    const result = item["result"]
    if (result !== "accept" && result !== "reject" && result !== "ban" && result !== "filter") throw invalid()
    return { templateId: userText(item["templateId"]), result }
  })
  if (new Set(parsed.map(item => item.templateId)).size !== parsed.length) throw invalid()
  return { code: userText(input["code"]), outcomes: parsed }
}

export function parseUserTask(value: unknown) {
  const input = userRecord(value, ["templateId", "subscriberIds", "idempotencyKey", "payload", "page"])
  const ids = input["subscriberIds"]
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 1000) throw invalid()
  const subscriberIds = ids.map((id: unknown) => userText(id, 64)).sort()
  if (new Set(subscriberIds).size !== subscriberIds.length) throw invalid()
  const rawPayload = input["payload"]
  if (typeof rawPayload !== "object" || rawPayload === null || Array.isArray(rawPayload)) throw invalid()
  const payload = Object.fromEntries(Object.entries(rawPayload).map(([key, val]) => [key, userText(val, 80)]).sort(([a], [b]) => String(a).localeCompare(String(b))))
  const page = input["page"] === null || input["page"] === undefined ? null : userText(input["page"], 255)
  if (page !== null && (!/^pages\/[A-Za-z0-9/_-]+(?:\?[^\s]*)?$/.test(page) || page.includes(".."))) throw invalid()
  return { templateId: userText(input["templateId"], 64), subscriberIds, idempotencyKey: userText(input["idempotencyKey"]), payload, page }
}

export function userTemplateData(fields: readonly UserTemplateField[], payload: Record<string, string>) {
  if (Object.keys(payload).length !== fields.length) throw invalid()
  const data: Record<string, { value: string }> = {}
  for (const field of fields) {
    const value = payload[field.key]
    if (value === undefined) throw invalid()
    if (field.rule === "thing" && [...value].length > 20) throw invalid()
    if (field.rule === "number" && (!/^\d+(?:\.\d+)?$/.test(value) || value.length > 32)) throw invalid()
    if (field.rule === "time") {
      if (!/^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}(?::\d{2})?)?$/.test(value)) throw invalid()
      const day = value.slice(0, 10)
      const date = new Date(`${day}T00:00:00Z`)
      if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day
        || Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) throw invalid()
    }
    data[field.key] = { value }
  }
  return data
}

function invalid(): BadRequestException {
  return new BadRequestException({ code: "user_notification_invalid", message: "订阅通知参数不正确" })
}
