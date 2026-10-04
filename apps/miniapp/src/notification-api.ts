import { ApiError } from "./api-error"
import { DEV_FAMILY_IDENTITY_HEADER, FALLBACK_API_BASE_URL, type MiniappRequestOptions, type MiniappRequestResult, type RequestTransport } from "./api-types"
import { parseNotificationAuthorization, parseNotificationOverview, parseContactEntries, parseCreatedInvitation, parseRecipientId, parseRecipientInvitation, parseRecipientInvitations, parseRecipientSummaries, parseRecipientTrip } from "./notification-parsers"
import type { FamilyNotificationAuthorization, FamilyNotificationOverview, NotificationApiOptions, NotificationAuthorizationInput, NotificationSubscribeOutcome, NotificationSubscribeTemplate } from "./notification-types"
import { getWechatSessionToken } from "./wechat-token"

export type * from "./notification-types"

export function requestNotificationSubscription(templateId: string, templates: readonly NotificationSubscribeTemplate[]): Promise<NotificationSubscribeOutcome> {
  if (!templates.some((item) => item.templateId === templateId)) return Promise.reject(new ApiError(0, "该消息提醒暂未开放，请联系工作人员。"))
  if (typeof uni.requestSubscribeMessage !== "function") return Promise.reject(new ApiError(0, "请在微信小程序中订阅通知。"))
  return new Promise((resolve, reject) => {
    uni.requestSubscribeMessage({
      tmplIds: [templateId],
      success: (value: unknown) => {
        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
          const result = Object.fromEntries(Object.entries(value))[templateId]
          if (result === "accept" || result === "reject" || result === "ban" || result === "filter") { resolve(result); return }
        }
        reject(new ApiError(0, "未完成微信订阅，请重新点击订阅。"))
      },
      fail: () => reject(new ApiError(0, "未完成微信订阅，请检查微信设置后重试。")),
    })
  })
}

export function createNotificationApi(options: NotificationApiOptions = {}) {
  const baseUrl = resolveApiBaseUrl(options.baseUrl)
  const familyIdentityHeader = options.familyIdentityHeader ?? import.meta.env["VITE_DEV_FAMILY_IDENTITY_HEADER"]
  const wechatSessionToken = options.wechatSessionToken ?? getWechatSessionToken()
  const request = options.request ?? requestWithUni
  return {
    getInvitations: async (orderId: string) => parseRecipientInvitations(await requestJson(request, baseUrl, `/orders/${encodeURIComponent(orderId)}/notification-invites`, "GET", familyIdentityHeader, wechatSessionToken)),
    createInvitation: async (orderId: string, authorizationDeadline: string) => parseCreatedInvitation(await requestJson(request, baseUrl, `/orders/${encodeURIComponent(orderId)}/notification-invites`, "POST", familyIdentityHeader, wechatSessionToken, { authorizationDeadline })),
    confirmInvitation: async (orderId: string, inviteId: string) => parseRecipientInvitation(await requestJson(request, baseUrl, `/orders/${encodeURIComponent(orderId)}/notification-invites/${encodeURIComponent(inviteId)}/confirm`, "POST", familyIdentityHeader, wechatSessionToken, {})),
    revokeInvitation: async (orderId: string, inviteId: string) => { await requestJson(request, baseUrl, `/orders/${encodeURIComponent(orderId)}/notification-invites/${encodeURIComponent(inviteId)}/revoke`, "POST", familyIdentityHeader, wechatSessionToken, {}) },
    getContactChannels: async (orderId: string) => parseContactEntries(await requestJson(request, baseUrl, `/orders/${encodeURIComponent(orderId)}/contact-channels`, "GET", familyIdentityHeader, wechatSessionToken)),
    acceptInvitation: async (token: string, receiverName: string, code: string) => parseRecipientId(await requestJson(request, baseUrl, "/notification-invites/accept", "POST", familyIdentityHeader, wechatSessionToken, { token, receiverName, code })),
    getReceivedTrips: async () => parseRecipientSummaries(await requestJson(request, baseUrl, "/notification-recipients", "GET", familyIdentityHeader, wechatSessionToken)),
    getRecipientTrip: async (authorizationId: string) => parseRecipientTrip(await requestJson(request, baseUrl, `/notification-recipients/${encodeURIComponent(authorizationId)}/trip`, "GET", familyIdentityHeader, wechatSessionToken)),
    subscribeRecipient: async (authorizationId: string, payload: { readonly templateId: string; readonly outcome: NotificationSubscribeOutcome; readonly code: string; readonly expectedVersion: number }) => { await requestJson(request, baseUrl, `/notification-recipients/${encodeURIComponent(authorizationId)}/subscribe`, "POST", familyIdentityHeader, wechatSessionToken, payload) },
    withdrawRecipient: async (authorizationId: string) => { await requestJson(request, baseUrl, `/notification-recipients/${encodeURIComponent(authorizationId)}/withdraw`, "POST", familyIdentityHeader, wechatSessionToken, {}) },
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
  if (response.statusCode < 200 || response.statusCode >= 300) throw new ApiError(response.statusCode, readErrorMessage(response.data) ?? "服务暂时无法响应，请稍后再试。")
  return response.data
}

function readErrorMessage(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined
  const message = Object.fromEntries(Object.entries(value))["message"]
  return typeof message === "string" ? message : undefined
}
