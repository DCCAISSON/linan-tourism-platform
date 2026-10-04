import { ApiError } from "./api-error"
import {
  DEV_FAMILY_IDENTITY_HEADER,
  FALLBACK_API_BASE_URL,
  type MiniappRequestOptions,
  type MiniappRequestResult,
  type RequestTransport,
} from "./api-types"
import { readErrorMessage, readRecord, readString } from "./api-parsers"
import { getWechatSessionToken } from "./wechat-token"

export type ServiceFeedbackPayload = {
  readonly tourSessionId: string
  readonly orderId: string
  readonly rating: number
  readonly content: string
  readonly contactName: string
  readonly allowPublic: boolean
  readonly idempotencyKey: string
}

export type ServiceFeedbackResult = {
  readonly id: string
  readonly status: "submitted"
  readonly public: false
}

export type ServiceFeedbackClient = {
  readonly submit: (payload: ServiceFeedbackPayload) => Promise<ServiceFeedbackResult>
}

export type ServiceFeedbackClientOptions = {
  readonly baseUrl?: string
  readonly familyIdentityHeader?: string
  readonly wechatSessionToken?: string
  readonly request?: RequestTransport
}

export function createServiceFeedbackClient(options: ServiceFeedbackClientOptions = {}): ServiceFeedbackClient {
  const baseUrl = resolveApiBaseUrl(options.baseUrl)
  const familyIdentityHeader = resolveDevFamilyIdentityHeader(options.familyIdentityHeader)
  const wechatSessionToken = options.wechatSessionToken ?? getWechatSessionToken()
  const request = options.request ?? requestWithUni
  return {
    submit: async (payload) => parseResult(await requestJson(request, baseUrl, "/feedback/family", familyIdentityHeader, wechatSessionToken, { ...payload, source: "family" })),
  }
}

function resolveApiBaseUrl(baseUrl?: string): string {
  const configured = baseUrl ?? import.meta.env["VITE_API_BASE_URL"]
  if (typeof configured === "string" && configured.length > 0) return configured.replace(/\/$/, "")
  return FALLBACK_API_BASE_URL
}

function resolveDevFamilyIdentityHeader(value?: string): string | undefined {
  const configured = value ?? import.meta.env["VITE_DEV_FAMILY_IDENTITY_HEADER"]
  return typeof configured === "string" && configured.length > 0 ? configured : undefined
}

async function requestWithUni(options: MiniappRequestOptions): Promise<MiniappRequestResult> {
  return await new Promise((resolve, reject) => {
    uni.request({ url: options.url, method: options.method, header: options.header, data: JSON.stringify(options.data), success: resolve, fail: reject })
  })
}

async function requestJson(request: RequestTransport, baseUrl: string, path: string, familyIdentityHeader: string | undefined, wechatSessionToken: string | undefined, data: object): Promise<unknown> {
  const response = await request({
    url: `${baseUrl}${path}`,
    method: "POST",
    header: buildHeaders(familyIdentityHeader, wechatSessionToken),
    data,
  })
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new ApiError(response.statusCode, readErrorMessage(response.data) ?? "服务暂时无法响应，请稍后再试。")
  }
  return response.data
}

function buildHeaders(familyIdentityHeader: string | undefined, wechatSessionToken: string | undefined): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (familyIdentityHeader !== undefined) headers[DEV_FAMILY_IDENTITY_HEADER] = familyIdentityHeader
  if (wechatSessionToken !== undefined) headers["Authorization"] = `Bearer ${wechatSessionToken}`
  return headers
}

function parseResult(value: unknown): ServiceFeedbackResult {
  const record = readRecord(value)
  if (record["status"] !== "submitted" || record["public"] !== false) throw new ApiError(0, "暂时无法确认提交结果，请稍后查看。")
  return { id: readString(record, "id"), status: "submitted", public: false }
}
