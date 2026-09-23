import { ApiError } from "./api-error"
import { DEV_FAMILY_IDENTITY_HEADER, FALLBACK_API_BASE_URL, type MiniappRequestOptions, type MiniappRequestResult, type RequestTransport } from "./api-types"
import { readCollection, readNonNegativeInteger, readRecord, readString } from "./api-parsers"

export type RefundApplicationStatus = "submitted" | "approved" | "rejected" | "cancelled"

export type RefundApplication = {
  readonly id: string
  readonly orderId: string
  readonly status: RefundApplicationStatus
  readonly reason: string
  readonly amountFen: number
  readonly lines: readonly { readonly lineId: string; readonly displayName: string; readonly amountFen: number }[]
  readonly submittedAt: string
  readonly updatedAt: string
  readonly reviewReason: string | null
  readonly reviewedAt: string | null
  readonly refundRequestId: string | null
  readonly refundStatus: "pending" | "succeeded" | "failed" | null
}

export type FamilyRefundApplicationClient = {
  readonly submitRefundApplication: (orderId: string, payload: {
    readonly lineIds: readonly string[]
    readonly reason: string
    readonly idempotencyKey: string
  }) => Promise<RefundApplication>
  readonly listRefundApplications: (orderId: string) => Promise<readonly RefundApplication[]>
  readonly cancelRefundApplication: (orderId: string, applicationId: string) => Promise<RefundApplication>
}

export function createRefundApplicationClient(options: {
  readonly baseUrl?: string
  readonly familyIdentityHeader?: string
  readonly request?: RequestTransport
} = {}): FamilyRefundApplicationClient {
  const baseUrl = (options.baseUrl ?? import.meta.env["VITE_API_BASE_URL"] ?? FALLBACK_API_BASE_URL).replace(/\/$/, "")
  const familyIdentityHeader = options.familyIdentityHeader ?? import.meta.env["VITE_DEV_FAMILY_IDENTITY_HEADER"]
  const request = options.request ?? requestWithUni
  return {
    submitRefundApplication: (orderId, payload) => requestApplication(request, baseUrl, familyIdentityHeader, `/orders/${encodeURIComponent(orderId)}/refund-applications`, "POST", payload),
    listRefundApplications: async (orderId) => readCollection(await requestJson(request, baseUrl, familyIdentityHeader, `/orders/${encodeURIComponent(orderId)}/refund-applications`, "GET"), parseRefundApplication),
    cancelRefundApplication: (orderId, applicationId) => requestApplication(request, baseUrl, familyIdentityHeader, `/orders/${encodeURIComponent(orderId)}/refund-applications/${encodeURIComponent(applicationId)}/cancel`, "POST", {}),
  }
}

async function requestApplication(
  request: RequestTransport,
  baseUrl: string,
  familyIdentityHeader: string | undefined,
  path: string,
  method: MiniappRequestOptions["method"],
  data: object,
): Promise<RefundApplication> {
  return parseRefundApplication(await requestJson(request, baseUrl, familyIdentityHeader, path, method, data))
}

async function requestWithUni(options: MiniappRequestOptions): Promise<MiniappRequestResult> {
  return await new Promise((resolve, reject) => {
    const requestOptions: UniApp.RequestOptions = { url: options.url, method: options.method, header: options.header, success: resolve, fail: reject }
    if (options.data !== undefined) requestOptions.data = JSON.stringify(options.data)
    uni.request(requestOptions)
  })
}

async function requestJson(
  request: RequestTransport,
  baseUrl: string,
  familyIdentityHeader: string | undefined,
  path: string,
  method: MiniappRequestOptions["method"],
  data?: object,
): Promise<unknown> {
  const header: Record<string, string> = {}
  if (data !== undefined) header["Content-Type"] = "application/json"
  if (familyIdentityHeader !== undefined && familyIdentityHeader.length > 0) header[DEV_FAMILY_IDENTITY_HEADER] = familyIdentityHeader
  const options: MiniappRequestOptions = data === undefined
    ? { url: `${baseUrl}${path}`, method, header }
    : { url: `${baseUrl}${path}`, method, header, data }
  const response = await request(options)
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const message = readErrorMessage(response.data) ?? `请求失败（${response.statusCode}）`
    throw new ApiError(response.statusCode, message)
  }
  return response.data
}

export function parseRefundApplication(value: unknown): RefundApplication {
  const record = readRecord(value)
  const status = readStatus(record)
  const refundStatus = record["refundStatus"]
  if (refundStatus !== null && refundStatus !== "pending" && refundStatus !== "succeeded" && refundStatus !== "failed") {
    throw new ApiError(0, "refundStatus 响应格式不正确")
  }
  return {
    id: readString(record, "id"),
    orderId: readString(record, "orderId"),
    status,
    reason: readString(record, "reason"),
    amountFen: readNonNegativeInteger(record, "amountFen"),
    lines: readCollection(record["lines"], parseLine),
    submittedAt: readString(record, "submittedAt"),
    updatedAt: readString(record, "updatedAt"),
    reviewReason: readNullableString(record, "reviewReason"),
    reviewedAt: readNullableString(record, "reviewedAt"),
    refundRequestId: readNullableString(record, "refundRequestId"),
    refundStatus,
  }
}

function parseLine(value: unknown): RefundApplication["lines"][number] {
  const record = readRecord(value)
  return { lineId: readString(record, "lineId"), displayName: readString(record, "displayName"), amountFen: readNonNegativeInteger(record, "amountFen") }
}

function readStatus(record: Record<string, unknown>): RefundApplicationStatus {
  const status = readString(record, "status")
  if (status === "submitted" || status === "approved" || status === "rejected" || status === "cancelled") return status
  throw new ApiError(0, "status 响应格式不正确")
}

function readNullableString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  if (value === null || typeof value === "string") return value
  throw new ApiError(0, `${key} 响应格式不正确`)
}

function readErrorMessage(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  const record = value as Readonly<Record<string, unknown>>
  return typeof record["message"] === "string" ? record["message"] : null
}
