import { ApiError } from "./api-error"
import { DEV_FAMILY_IDENTITY_HEADER, FALLBACK_API_BASE_URL, type MiniappRequestOptions, type MiniappRequestResult, type RequestTransport } from "./api-types"
import { parseNotificationAuthorization, parseNotificationOverview } from "./notification-parsers"
import type { FamilyNotificationAuthorization, FamilyNotificationOverview, NotificationApiOptions, NotificationAuthorizationInput } from "./notification-types"
import { getWechatSessionToken } from "./wechat-token"

export type * from "./notification-types"

export function createNotificationApi(options: NotificationApiOptions = {}) {
  const baseUrl = resolveApiBaseUrl(options.baseUrl)
  const familyIdentityHeader = options.familyIdentityHeader ?? import.meta.env["VITE_DEV_FAMILY_IDENTITY_HEADER"]
  const wechatSessionToken = options.wechatSessionToken ?? getWechatSessionToken()
  const request = options.request ?? requestWithUni
  return {
    getOverview: async (orderId: string): Promise<FamilyNotificationOverview> =>
      parseNotificationOverview(await requestJson(request, baseUrl, `/orders/${encodeURIComponent(orderId)}/notifications`, "GET", familyIdentityHeader, wechatSessionToken)),
    authorize: async (orderId: string, payload: NotificationAuthorizationInput): Promise<FamilyNotificationAuthorization> =>
      parseNotificationAuthorization(await requestJson(request, baseUrl, `/orders/${encodeURIComponent(orderId)}/notification-recipients`, "POST", familyIdentityHeader, wechatSessionToken, payload)),
    withdraw: async (orderId: string, authorizationId: string, expectedVersion: number): Promise<FamilyNotificationAuthorization> =>
      parseNotificationAuthorization(await requestJson(request, baseUrl, `/orders/${encodeURIComponent(orderId)}/notification-recipients/${encodeURIComponent(authorizationId)}/withdraw`, "POST", familyIdentityHeader, wechatSessionToken, { expectedVersion })),
  }
}

function resolveApiBaseUrl(baseUrl?: string): string {
  const configured = baseUrl ?? import.meta.env["VITE_API_BASE_URL"]
  return typeof configured === "string" && configured.length > 0 ? configured.replace(/\/$/, "") : FALLBACK_API_BASE_URL
}

async function requestWithUni(options: MiniappRequestOptions): Promise<MiniappRequestResult> {
  return await new Promise((resolve, reject) => uni.request({ ...options, success: resolve, fail: reject }))
}

async function requestJson(
  request: RequestTransport,
  baseUrl: string,
  path: string,
  method: MiniappRequestOptions["method"],
  familyIdentityHeader: string | undefined,
  wechatSessionToken: string | undefined,
  data?: object,
): Promise<unknown> {
  const header: Record<string, string> = data === undefined ? {} : { "Content-Type": "application/json" }
  if (familyIdentityHeader !== undefined && familyIdentityHeader.length > 0) header[DEV_FAMILY_IDENTITY_HEADER] = familyIdentityHeader
  if (wechatSessionToken !== undefined) header["Authorization"] = `Bearer ${wechatSessionToken}`
  const base = { url: `${baseUrl}${path}`, method, header }
  const response = await request(data === undefined ? base : { ...base, data })
  if (response.statusCode < 200 || response.statusCode >= 300) throw new ApiError(response.statusCode, readErrorMessage(response.data) ?? `request failed (${response.statusCode})`)
  return response.data
}

function readErrorMessage(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined
  const message = Object.fromEntries(Object.entries(value))["message"]
  return typeof message === "string" ? message : undefined
}
