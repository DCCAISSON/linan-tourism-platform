import { resolveAdminApiBaseUrl } from "./base-url"
import { ApiError } from "./configuration.errors"
import { parseNotificationContent, parseNotificationEntry, parseNotificationPreview, parseNotificationSession, parseNotificationTask } from "./notifications.parsers"
import type { NotificationContentInput, NotificationContentVersion, NotificationEntryInput, NotificationEntryKind, NotificationChannelEntry, NotificationSession, NotificationTargetPreview, NotificationTask, NotificationTaskInput } from "./notifications.types"

export type * from "./notifications.types"

const apiBaseUrl = resolveAdminApiBaseUrl()

export async function getNotificationSession(sessionId: string): Promise<NotificationSession> {
  return parseNotificationSession(await request(`/staff/notifications/sessions/${encodeURIComponent(sessionId)}`))
}

export async function createNotificationContent(sessionId: string, payload: NotificationContentInput): Promise<NotificationContentVersion> {
  return parseNotificationContent(await request(`/staff/notifications/sessions/${encodeURIComponent(sessionId)}/content-versions`, jsonRequest("POST", payload)))
}

export async function saveNotificationEntry(sessionId: string, kind: NotificationEntryKind, payload: NotificationEntryInput): Promise<NotificationChannelEntry> {
  return parseNotificationEntry(await request(`/staff/notifications/sessions/${encodeURIComponent(sessionId)}/entries/${kind}`, jsonRequest("PUT", payload)))
}

export async function previewNotificationTargets(sessionId: string, authorizationIds: readonly string[]): Promise<readonly NotificationTargetPreview[]> {
  return parseNotificationPreview(await request(`/staff/notifications/sessions/${encodeURIComponent(sessionId)}/preview`, jsonRequest("POST", { authorizationIds })))
}

export async function createNotificationTask(sessionId: string, payload: NotificationTaskInput): Promise<NotificationTask> {
  return parseNotificationTask(await request(`/staff/notifications/sessions/${encodeURIComponent(sessionId)}/tasks`, jsonRequest("POST", payload)))
}

export async function getNotificationTask(taskId: string): Promise<NotificationTask> {
  return parseNotificationTask(await request(`/staff/notifications/tasks/${encodeURIComponent(taskId)}`))
}

export async function sendNotificationTask(taskId: string): Promise<NotificationTask> {
  return parseNotificationTask(await request(`/staff/notifications/tasks/${encodeURIComponent(taskId)}/send`, { method: "POST" }))
}

export async function retryNotificationTask(taskId: string): Promise<NotificationTask> {
  return parseNotificationTask(await request(`/staff/notifications/tasks/${encodeURIComponent(taskId)}/retry`, { method: "POST" }))
}

export function readableNotificationError(error: unknown): string {
  return error instanceof ApiError ? error.message : "通知操作失败，请稍后重试。"
}

async function request(path: string, init: RequestInit = { method: "GET" }): Promise<unknown> {
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, credentials: "include" })
  let value: unknown
  try { value = await response.json() }
  catch (error) { if (error instanceof SyntaxError) value = undefined; else throw error }
  if (!response.ok) throw new ApiError(response.status, readErrorMessage(value) ?? `请求失败（${response.status}）`)
  return value
}

function jsonRequest(method: "POST" | "PUT", payload: object): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
}

function readErrorMessage(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined
  const message = Object.fromEntries(Object.entries(value))["message"]
  return typeof message === "string" ? message : undefined
}
