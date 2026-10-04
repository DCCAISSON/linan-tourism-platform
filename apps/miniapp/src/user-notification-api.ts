import { ApiError } from "./api-error"
import { FALLBACK_API_BASE_URL, type RequestTransport } from "./api-types"
import { clearWechatSessionToken, getWechatSessionToken } from "./wechat-token"
import type { NotificationSubscribeOutcome } from "./notification-types"

export type UserNotificationTemplate = {
  readonly id: string
  readonly title: string
  readonly category: string
  readonly templateId: string
  readonly enabled: boolean
  readonly subscription: { readonly id: string; readonly status: "active" | "rejected" | "withdrawn" | "consumed"; readonly version: number } | null
}
export type SubscriptionChoice = { readonly templateId: string; readonly result: NotificationSubscribeOutcome }

export function requestUserSubscriptions(templates: readonly UserNotificationTemplate[]): Promise<readonly SubscriptionChoice[]> {
  const available = templates.filter((item) => item.enabled)
  if (available.length === 0 || available.length > 3) return Promise.reject(new ApiError(0, "请选择1至3类通知。"))
  if (typeof uni.requestSubscribeMessage !== "function") return Promise.reject(new ApiError(0, "请在微信小程序中订阅消息。"))
  return new Promise((resolve, reject) => uni.requestSubscribeMessage({
    tmplIds: available.map((item) => item.templateId),
    success: (value: unknown) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        reject(new ApiError(0, "微信未返回完整订阅结果，请重试。")); return
      }
      const record = readRecord(value)
      const choices: SubscriptionChoice[] = []
      for (const item of available) {
        const result = record[item.templateId]
        if (result !== "accept" && result !== "reject" && result !== "ban" && result !== "filter") {
          reject(new ApiError(0, "微信未返回完整订阅结果，请重试。")); return
        }
        choices.push({ templateId: item.templateId, result })
      }
      resolve(choices)
    },
    fail: () => reject(new ApiError(0, "未完成订阅，请检查微信消息设置后重试。")),
  }))
}

export function createUserNotificationApi(options: { readonly baseUrl?: string; readonly request?: RequestTransport } = {}) {
  const baseUrl = (options.baseUrl ?? import.meta.env["VITE_API_BASE_URL"] ?? FALLBACK_API_BASE_URL).replace(/\/$/, "")
  const transport: RequestTransport = options.request ?? ((input) => new Promise((resolve, reject) => uni.request({ ...input, success: resolve, fail: reject })))
  async function request(path: string, data?: object): Promise<readonly UserNotificationTemplate[]> {
    const token = getWechatSessionToken()
    if (token === undefined) throw new ApiError(401, "请先登录后订阅消息。")
    const header: Record<string, string> = { Authorization: `Bearer ${token}` }
    if (data !== undefined) header["Content-Type"] = "application/json"
    const response = await transport({ url: baseUrl + path, method: data === undefined ? "GET" : "POST", header, ...(data === undefined ? {} : { data }) })
    if (response.statusCode === 401 && token === getWechatSessionToken()) clearWechatSessionToken()
    if (response.statusCode < 200 || response.statusCode >= 300) throw new ApiError(response.statusCode, "消息订阅保存或加载失败，请重试。")
    const record = readRecord(response.data)
    if (!Array.isArray(record["templates"])) throw new ApiError(0, "通知列表格式不正确。")
    return record["templates"].map(parseTemplate)
  }
  return {
    overview: () => request("/user-notifications"),
    subscribe: (code: string, outcomes: readonly SubscriptionChoice[]) => request("/user-notifications/subscriptions", { code, outcomes }),
    withdraw: (id: string, expectedVersion: number) => request(`/user-notifications/subscriptions/${encodeURIComponent(id)}/withdraw`, { expectedVersion }),
  }
}

function parseTemplate(value: unknown): UserNotificationTemplate {
  const record = readRecord(value)
  const subscription = record["subscription"]
  let parsed: UserNotificationTemplate["subscription"] = null
  if (subscription !== null) {
    const item = readRecord(subscription)
    const status = item["status"]
    const version = item["version"]
    if ((status !== "active" && status !== "rejected" && status !== "withdrawn" && status !== "consumed") || typeof version !== "number" || !Number.isSafeInteger(version) || version < 1) throw new ApiError(0, "消息提醒暂时无法加载，请稍后再试。")
    parsed = { id: readString(item, "id"), status, version }
  }
  if (typeof record["enabled"] !== "boolean" || record["type"] !== "once") throw new ApiError(0, "消息提醒暂时无法加载，请稍后再试。")
  return { id: readString(record, "id"), title: readString(record, "title"), category: readString(record, "category"), templateId: readString(record, "templateId"), enabled: record["enabled"], subscription: parsed }
}
function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ApiError(0, "消息提醒暂时无法加载，请稍后再试。")
  return Object.fromEntries(Object.entries(value))
}
function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== "string" || value.length === 0) throw new ApiError(0, "消息提醒暂时无法加载，请稍后再试。")
  return value
}
