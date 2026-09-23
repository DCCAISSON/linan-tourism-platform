import { ApiError } from "./api-error"
import { DEV_FAMILY_IDENTITY_HEADER, FALLBACK_API_BASE_URL, type MiniappRequestOptions, type MiniappRequestResult, type RequestTransport } from "./api-types"
import { readCollection, readRecord, readString } from "./api-parsers"

export type PersonRef = `paid:${string}` | `imported:${string}`
export type FamilyPublicExecutionSummary = {
  readonly tourSessionId: string
  readonly dailyReports: readonly { readonly reportDate: string; readonly publicSummary: string }[]
  readonly events: readonly { readonly occurredAt: string; readonly category: string; readonly publicSummary: string }[]
}
export type HealthAuthorization = { readonly id: string; readonly tourSessionId: string; readonly orderId: string; readonly personRef: PersonRef; readonly active: boolean; readonly version: number; readonly authorizedAt: string; readonly revokedAt: string | null }
export type HealthAuthorizationPayload = { readonly personRef: PersonRef; readonly allergies: string; readonly medicalNotes: string; readonly emergencyMedicine: string }

export function createExecutionHealthClient(options: { readonly baseUrl?: string; readonly familyIdentityHeader?: string; readonly request?: RequestTransport } = {}) {
  const baseUrl = (options.baseUrl ?? import.meta.env["VITE_API_BASE_URL"] ?? FALLBACK_API_BASE_URL).replace(/\/$/, "")
  const familyIdentityHeader = options.familyIdentityHeader ?? import.meta.env["VITE_DEV_FAMILY_IDENTITY_HEADER"]
  const request = options.request ?? requestWithUni
  return {
    publicSummary: async (orderId: string) => parsePublicSummary(await requestJson(request, baseUrl, familyIdentityHeader, `/orders/${encodeURIComponent(orderId)}/execution/public-summary`, "GET")),
    authorizeHealth: async (orderId: string, payload: HealthAuthorizationPayload) => parseHealthAuthorization(await requestJson(request, baseUrl, familyIdentityHeader, `/orders/${encodeURIComponent(orderId)}/execution/health-authorizations`, "POST", payload)),
    revokeHealth: async (orderId: string, personRef: PersonRef) => parseHealthAuthorization(await requestJson(request, baseUrl, familyIdentityHeader, `/orders/${encodeURIComponent(orderId)}/execution/health-authorizations/${encodeURIComponent(personRef)}/revoke`, "POST", {})),
  }
}

async function requestWithUni(options: MiniappRequestOptions): Promise<MiniappRequestResult> {
  return await new Promise((resolve, reject) => {
    const requestOptions: UniApp.RequestOptions = { url: options.url, method: options.method, header: options.header, success: resolve, fail: reject }
    if (options.data !== undefined) requestOptions.data = JSON.stringify(options.data)
    uni.request(requestOptions)
  })
}

async function requestJson(request: RequestTransport, baseUrl: string, familyIdentityHeader: string | undefined, path: string, method: MiniappRequestOptions["method"], data?: object): Promise<unknown> {
  const header: Record<string, string> = {}
  if (data !== undefined) header["Content-Type"] = "application/json"
  if (familyIdentityHeader !== undefined && familyIdentityHeader.length > 0) header[DEV_FAMILY_IDENTITY_HEADER] = familyIdentityHeader
  const response = await request(data === undefined ? { url: `${baseUrl}${path}`, method, header } : { url: `${baseUrl}${path}`, method, header, data })
  if (response.statusCode < 200 || response.statusCode >= 300) throw new ApiError(response.statusCode, readErrorMessage(response.data) ?? `请求失败（${response.statusCode}）`)
  return response.data
}

function parsePublicSummary(value: unknown): FamilyPublicExecutionSummary {
  const record = readRecord(value)
  return { tourSessionId: readString(record, "tourSessionId"), dailyReports: readCollection(record["dailyReports"], parseDaily), events: readCollection(record["events"], parseEvent) }
}
function parseDaily(value: unknown): FamilyPublicExecutionSummary["dailyReports"][number] { const record = readRecord(value); return { reportDate: readString(record, "reportDate"), publicSummary: readString(record, "publicSummary") } }
function parseEvent(value: unknown): FamilyPublicExecutionSummary["events"][number] { const record = readRecord(value); return { occurredAt: readString(record, "occurredAt"), category: readString(record, "category"), publicSummary: readString(record, "publicSummary") } }
function parseHealthAuthorization(value: unknown): HealthAuthorization {
  const record = readRecord(value)
  const active = record["active"]
  const version = record["version"]
  const revokedAt = record["revokedAt"]
  if (typeof active !== "boolean" || typeof version !== "number" || !Number.isSafeInteger(version)) throw new ApiError(0, "健康授权响应格式不正确")
  if (revokedAt !== null && typeof revokedAt !== "string") throw new ApiError(0, "健康授权响应格式不正确")
  return { id: readString(record, "id"), tourSessionId: readString(record, "tourSessionId"), orderId: readString(record, "orderId"), personRef: readPersonRef(record), active, version, authorizedAt: readString(record, "authorizedAt"), revokedAt }
}
function readPersonRef(record: Record<string, unknown>): PersonRef {
  const value = readString(record, "personRef")
  if (value.startsWith("paid:") || value.startsWith("imported:")) return value as PersonRef
  throw new ApiError(0, "personRef 响应格式不正确")
}
function readErrorMessage(value: unknown): string | null { return typeof value === "object" && value !== null && !Array.isArray(value) && typeof (value as { message?: unknown }).message === "string" ? (value as { message: string }).message : null }
