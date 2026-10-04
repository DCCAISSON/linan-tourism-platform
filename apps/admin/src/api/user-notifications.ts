import { resolveAdminApiBaseUrl } from "./base-url"
import { ApiError } from "./configuration.errors"
import { parseUserMessageDetail, parseUserMessagePreview, parseUserMessageTasks, parseUserMessageTemplates } from "./user-notifications.parsers"
export type * from "./user-notifications.parsers"

export type UserMessageInput = { readonly templateId: string; readonly subscriberIds: readonly string[]; readonly idempotencyKey: string; readonly payload: Readonly<Record<string, string>>; readonly page: string }
const base = `${resolveAdminApiBaseUrl()}/staff/user-notifications`
export async function getUserMessageTemplates() { return parseUserMessageTemplates(await request("/templates")) }
export async function getUserMessageTasks() { return parseUserMessageTasks(await request("/tasks")) }
export async function getUserMessageTask(id: string) { return parseUserMessageDetail(await request(`/tasks/${encodeURIComponent(id)}`)) }
export async function previewUserMessages(templateId: string) { return parseUserMessagePreview(await request("/preview", { templateId })) }
export async function createUserMessageTask(input: UserMessageInput) { return parseUserMessageDetail(await request("/tasks", input)) }
export async function sendUserMessageTask(id: string) { return parseUserMessageDetail(await request(`/tasks/${encodeURIComponent(id)}/send`, {})) }
async function request(path: string, body?: object): Promise<unknown> {
  const response = await fetch(`${base}${path}`, { credentials: "include", ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) })
  let value: unknown
  try { value = await response.json() } catch (error) { if (error instanceof SyntaxError) throw new ApiError(response.status, "用户消息响应格式不正确，请刷新后重试。"); throw error }
  if (!response.ok) {
    const message = typeof value === "object" && value !== null ? Object.fromEntries(Object.entries(value))["message"] : undefined
    throw new ApiError(response.status, typeof message === "string" ? message : `请求失败（${response.status}）`)
  }
  return value
}
