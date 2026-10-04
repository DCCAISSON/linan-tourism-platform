import { ApiError } from "./configuration.errors"
import type {
  NotificationBusinessSource,
  NotificationAttempt,
  NotificationChannel,
  NotificationChannelEntry,
  NotificationContentVersion,
  NotificationDeliveryStatus,
  NotificationRelation,
  NotificationSession,
  NotificationTarget,
  NotificationTargetPreview,
  NotificationTask,
  NotificationTaskStatus,
  NotificationTaskSummary,
  NotificationSessionOption,
} from "./notifications.types"

export function parseNotificationSession(value: unknown): NotificationSession {
  const record = readRecord(value, "notification session")
  return {
    sources: record["sources"] === undefined ? [] : readArray(record, "sources", "notification session").map(parseBusinessSource),
    canWrite: record["canWrite"] === true,
    canSend: record["canSend"] === true,
    wechatConfigured: record["wechatConfigured"] === true,
    contents: readArray(record, "contents", "notification session").map(parseContent),
    entries: readArray(record, "entries", "notification session").map(parseEntry),
    tasks: readArray(record, "tasks", "notification session").map(parseTaskSummary),
  }
}

function parseBusinessSource(value: unknown): NotificationBusinessSource {
  const row = readRecord(value, "notification source")
  const kind = row["kind"]
  const status = row["status"]
  if (kind !== "order_created" && kind !== "pretrip_updated") throw invalid("notification source.kind")
  if (status !== "expired" && status !== "linked" && status !== "awaiting_authorization" && status !== "pending") throw invalid("notification source.status")
  const authorizationIds = readArray(row, "authorizationIds", "notification source").map(id => {
    if (typeof id !== "string") throw invalid("notification source.authorizationIds")
    return id
  })
  return { id: readString(row, "id", "notification source"), kind, status, authorizationIds,
    orderId: readNullableString(row, "orderId", "notification source"), sourceVersion: readCount(row, "sourceVersion", "notification source"),
    title: readString(row, "title", "notification source"), bodyText: readString(row, "bodyText", "notification source"),
    createdAt: readString(row, "createdAt", "notification source"), linkedTaskId: readNullableString(row, "linkedTaskId", "notification source") }
}

export function parseNotificationContent(value: unknown): NotificationContentVersion {
  return parseContent(value)
}

export function parseNotificationEntry(value: unknown): NotificationChannelEntry {
  return parseEntry(value)
}

export function parseNotificationPreview(value: unknown): readonly NotificationTargetPreview[] {
  if (!Array.isArray(value)) throw invalid("notification preview")
  return value.map(parsePreviewTarget)
}

export function parseNotificationTask(value: unknown): NotificationTask {
  const record = readRecord(value, "notification task")
  const tourSessionId = record["tourSessionId"]
  const base = parseTaskSummary(record)
  const parsed = {
    ...base,
    targets: readArray(record, "targets", "notification task").map(parseTarget),
    attempts: Array.isArray(record["attempts"]) ? record["attempts"].map(parseAttempt) : [],
  }
  return typeof tourSessionId === "string" ? { ...parsed, tourSessionId } : parsed
}

function parseContent(value: unknown): NotificationContentVersion {
  const record = readRecord(value, "notification content")
  return {
    id: readString(record, "id", "notification content"),
    title: readString(record, "title", "notification content"),
    bodyText: readString(record, "bodyText", "notification content"),
    templateId: readNullableString(record, "templateId", "notification content"),
    miniappPage: readNullableString(record, "miniappPage", "notification content"),
    templateData: parseTemplateFields(record["templateData"] ?? {}),
    createdAt: readString(record, "createdAt", "notification content"),
  }
}

export function parseNotificationSessions(value: unknown): readonly NotificationSessionOption[] {
  if (!Array.isArray(value)) throw invalid("notification sessions")
  return value.map(item => { const row = readRecord(item, "notification session"); return { id: readString(row, "id", "notification session"), label: readString(row, "label", "notification session") } })
}

function parseTemplateFields(value: unknown): Readonly<Record<string, { readonly value: string }>> {
  const record = readRecord(value, "template fields")
  return Object.fromEntries(Object.entries(record).map(([key, field]) => [key, { value: readString(readRecord(field, "template field"), "value", "template field") }]))
}

function parseEntry(value: unknown): NotificationChannelEntry {
  const record = readRecord(value, "notification entry")
  const enabled = readBoolean(record, "enabled", "notification entry")
  const url = readString(record, "url", "notification entry")
  if (enabled && !url.startsWith("https://")) throw invalid("notification entry.url")
  return {
    kind: readEntryKind(record, "kind"),
    ...(record["corpId"] === undefined ? {} : { corpId: readNullableString(record, "corpId", "notification entry") }),
    label: readString(record, "label", "notification entry"),
    url,
    enabled,
    version: readCount(record, "version", "notification entry"),
  }
}

function parseTaskSummary(value: unknown): NotificationTaskSummary {
  const record = readRecord(value, "notification task")
  return {
    id: readString(record, "id", "notification task"),
    contentVersionId: readString(record, "contentVersionId", "notification task"),
    status: readTaskStatus(record, "status"),
    createdAt: readString(record, "createdAt", "notification task"),
  }
}

function parsePreviewTarget(value: unknown): NotificationTargetPreview {
  const record = readRecord(value, "notification target")
  return {
    authorizationId: readString(record, "authorizationId", "notification target"),
    orderId: readString(record, "orderId", "notification target"),
    receiverName: readString(record, "receiverName", "notification target"),
    relation: readRelation(record, "relation"),
    channel: readChannel(record, "channel"),
  }
}

function parseTarget(value: unknown): NotificationTarget {
  const record = readRecord(value, "notification target")
  return {
    id: readString(record, "id", "notification target"),
    ...parsePreviewTarget(record),
    status: readDeliveryStatus(record, "status"),
  }
}

function parseAttempt(value: unknown): NotificationAttempt {
  const record = readRecord(value, "notification attempt")
  const deliveryEvidence = record["deliveryEvidence"]
  const readStatus = record["readStatus"]
  if (deliveryEvidence !== null && deliveryEvidence !== "api_accepted_only") throw invalid("notification attempt.deliveryEvidence")
  if (readStatus !== "unknown") throw invalid("notification attempt.readStatus")
  return {
    id: readString(record, "id", "notification attempt"),
    targetId: readString(record, "targetId", "notification attempt"),
    attemptNumber: readCount(record, "attemptNumber", "notification attempt"),
    status: readDeliveryStatus(record, "status"),
    errorCode: readNullableString(record, "errorCode", "notification attempt"),
    providerMessage: readString(record, "providerMessage", "notification attempt"),
    acceptedAt: readNullableString(record, "acceptedAt", "notification attempt"),
    deliveryEvidence,
    readStatus,
    createdAt: readString(record, "createdAt", "notification attempt"),
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
function readRelation(record: Record<string, unknown>, key: string): NotificationRelation { const value = record[key]; if (value === "guardian" || value === "traveler" || value === "emergency_contact" || value === "other") return value; throw invalid(`notification target.${key}`) }
function readChannel(record: Record<string, unknown>, key: string): NotificationChannel { const value = record[key]; if (value === "wechat_subscribe" || value === "manual") return value; throw invalid(`notification target.${key}`) }
function readEntryKind(record: Record<string, unknown>, key: string): NotificationChannelEntry["kind"] { const value = record[key]; if (value === "enterprise_wechat" || value === "official_account" || value === "customer_service") return value; throw invalid(`notification entry.${key}`) }
function readDeliveryStatus(record: Record<string, unknown>, key: string): NotificationDeliveryStatus { const value = record[key]; if (value === "pending" || value === "api_accepted" || value === "undelivered" || value === "retryable_failed" || value === "manual_required") return value; throw invalid(`notification target.${key}`) }
function readTaskStatus(record: Record<string, unknown>, key: string): NotificationTaskStatus { const value = record[key]; if (value === "pending" || value === "completed" || value === "retryable_failed" || value === "manual_required") return value; throw invalid(`notification task.${key}`) }
function invalid(field: string): ApiError { return new ApiError(0, `${field} response format is invalid`) }
