import { ApiError } from "./api-error"
import type { FamilyNotificationAuthorization, FamilyNotificationEntry, FamilyNotificationOverview, NotificationChannel, NotificationRelation } from "./notification-types"

export function parseNotificationOverview(value: unknown): FamilyNotificationOverview {
  const record = readRecord(value, "notification overview")
  return {
    orderId: readString(record, "orderId", "notification overview"),
    authorizations: readArray(record, "authorizations", "notification overview").map(parseAuthorization),
    entries: readArray(record, "entries", "notification overview").map(parseEntry),
    subscribeTemplates: record["subscribeTemplates"] === undefined ? [] : readArray(record, "subscribeTemplates", "notification overview").map((value) => {
      const item = readRecord(value, "subscription template")
      const templateId = readString(item, "templateId", "subscription template")
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(templateId)) throw invalid("subscription template.templateId")
      return { templateId, title: readString(item, "title", "subscription template") }
    }),
  }
}

export function parseNotificationAuthorization(value: unknown): FamilyNotificationAuthorization {
  return parseAuthorization(value)
}

function parseAuthorization(value: unknown): FamilyNotificationAuthorization {
  const record = readRecord(value, "notification authorization")
  return {
    id: readString(record, "id", "notification authorization"),
    orderId: readString(record, "orderId", "notification authorization"),
    receiverName: readString(record, "receiverName", "notification authorization"),
    relation: readRelation(record, "relation"),
    channel: readChannel(record, "channel"),
    active: readBoolean(record, "active", "notification authorization"),
    version: readCount(record, "version", "notification authorization"),
    revokedAt: readNullableString(record, "revokedAt", "notification authorization"),
    createdAt: readString(record, "createdAt", "notification authorization"),
  }
}

function parseEntry(value: unknown): FamilyNotificationEntry {
  const record = readRecord(value, "notification entry")
  const url = readString(record, "url", "notification entry")
  const enabled = readBoolean(record, "enabled", "notification entry")
  if (enabled && !url.startsWith("https://")) throw invalid("notification entry.url")
  return {
    kind: readEntryKind(record, "kind"),
    label: readString(record, "label", "notification entry"),
    url,
    enabled,
    version: readCount(record, "version", "notification entry"),
  }
}

function readRecord(value: unknown, name: string): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return Object.fromEntries(Object.entries(value))
  throw invalid(name)
}
function readArray(record: Record<string, unknown>, key: string, name: string): readonly unknown[] { const value = record[key]; if (Array.isArray(value)) return value; throw invalid(`${name}.${key}`) }
function readString(record: Record<string, unknown>, key: string, name: string): string { const value = record[key]; if (typeof value === "string") return value; throw invalid(`${name}.${key}`) }
function readNullableString(record: Record<string, unknown>, key: string, name: string): string | null { const value = record[key]; if (value === null || typeof value === "string") return value; throw invalid(`${name}.${key}`) }
function readBoolean(record: Record<string, unknown>, key: string, name: string): boolean { const value = record[key]; if (typeof value === "boolean") return value; throw invalid(`${name}.${key}`) }
function readCount(record: Record<string, unknown>, key: string, name: string): number { const value = record[key]; if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value; throw invalid(`${name}.${key}`) }
function readRelation(record: Record<string, unknown>, key: string): NotificationRelation { const value = record[key]; if (value === "guardian" || value === "traveler" || value === "emergency_contact" || value === "other") return value; throw invalid(`notification authorization.${key}`) }
function readChannel(record: Record<string, unknown>, key: string): NotificationChannel { const value = record[key]; if (value === "wechat_subscribe" || value === "manual") return value; throw invalid(`notification authorization.${key}`) }
function readEntryKind(record: Record<string, unknown>, key: string): FamilyNotificationEntry["kind"] { const value = record[key]; if (value === "enterprise_wechat" || value === "official_account" || value === "customer_service") return value; throw invalid(`notification entry.${key}`) }
function invalid(field: string): ApiError { return new ApiError(0, `${field} response format is invalid`) }
