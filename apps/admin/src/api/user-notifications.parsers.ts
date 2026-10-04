import { ApiError } from "./configuration.errors"

export type UserMessageTemplate = { readonly id: string; readonly title: string; readonly category: string; readonly templateId: string; readonly type: "once"; readonly enabled: boolean; readonly fields: readonly { readonly key: string; readonly label: string; readonly rule: "thing" | "number" | "time" }[] }
export type UserMessageTask = { readonly id: string; readonly templateId: string; readonly status: "pending" | "completed" | "manual_required"; readonly createdAt: string; readonly payloadSnapshot: { readonly title: string; readonly templateId: string; readonly page: string | null; readonly data: Readonly<Record<string, { readonly value: string }>> } }
export type UserMessageStatus = "pending" | "api_accepted" | "rejected" | "unknown" | "blocked"
export type UserMessageDetail = { readonly task: UserMessageTask; readonly targets: readonly { readonly id: string; readonly subscriptionId: string; readonly status: UserMessageStatus }[]; readonly attempts: readonly { readonly id: string; readonly targetId: string; readonly status: Exclude<UserMessageStatus, "pending">; readonly errorCode: string | null }[] }
export type UserMessagePreview = { readonly subscribers: readonly { readonly id: string; readonly version: number }[]; readonly eligibleCount: number }

function invalid(): never { throw new ApiError(0, "用户消息响应格式不正确，请刷新后重试。") }
function record(value: unknown): Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value)) return invalid(); return Object.fromEntries(Object.entries(value)) }
function text(value: unknown): string { return typeof value === "string" ? value : invalid() }
function nullableText(value: unknown): string | null { return value === null ? null : text(value) }
function integer(value: unknown): number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : invalid() }
function list(value: unknown): readonly unknown[] { return Array.isArray(value) ? value : invalid() }
function status(value: unknown): UserMessageStatus { if (value === "pending" || value === "api_accepted" || value === "rejected" || value === "unknown" || value === "blocked") return value; return invalid() }

export function parseUserMessageTemplates(value: unknown): readonly UserMessageTemplate[] {
  return list(record(value)["templates"]).map(item => {
    const row = record(item)
    if (row["type"] !== "once" || typeof row["enabled"] !== "boolean") return invalid()
    return { id: text(row["id"]), title: text(row["title"]), category: text(row["category"]), templateId: text(row["templateId"]), type: "once", enabled: row["enabled"], fields: list(row["fields"]).map(item => {
      const field = record(item), rule = field["rule"]
      if (rule !== "thing" && rule !== "number" && rule !== "time") return invalid()
      return { key: text(field["key"]), label: text(field["label"]), rule }
    }) }
  })
}
export function parseUserMessagePreview(value: unknown): UserMessagePreview {
  const row = record(value)
  return { eligibleCount: integer(row["eligibleCount"]), subscribers: list(row["subscribers"]).map(item => { const row = record(item); return { id: text(row["id"]), version: integer(row["version"]) } }) }
}
function task(value: unknown): UserMessageTask {
  const row = record(value), snapshot = record(row["payloadSnapshot"]), taskStatus = row["status"]
  if (taskStatus !== "pending" && taskStatus !== "completed" && taskStatus !== "manual_required") return invalid()
  const data = Object.fromEntries(Object.entries(record(snapshot["data"])).map(([key, value]) => [key, { value: text(record(value)["value"]) }]))
  return { id: text(row["id"]), templateId: text(row["templateId"]), status: taskStatus, createdAt: text(row["createdAt"]), payloadSnapshot: { title: text(snapshot["title"]), templateId: text(snapshot["templateId"]), page: nullableText(snapshot["page"]), data } }
}
export function parseUserMessageTasks(value: unknown): readonly UserMessageTask[] { return list(record(value)["tasks"]).map(task) }
export function parseUserMessageDetail(value: unknown): UserMessageDetail {
  const row = record(value)
  return { task: task(row["task"]), targets: list(row["targets"]).map(item => { const row = record(item); return { id: text(row["id"]), subscriptionId: text(row["subscriptionId"]), status: status(row["status"]) } }), attempts: list(row["attempts"]).map(item => {
    const row = record(item), attemptStatus = status(row["status"])
    if (attemptStatus === "pending") return invalid()
    return { id: text(row["id"]), targetId: text(row["targetId"]), status: attemptStatus, errorCode: nullableText(row["errorCode"]) }
  }) }
}
