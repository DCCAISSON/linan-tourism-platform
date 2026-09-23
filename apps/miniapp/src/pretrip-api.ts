import { ApiError } from "./api-error"
import { DEV_FAMILY_IDENTITY_HEADER, FALLBACK_API_BASE_URL, type MiniappRequestOptions, type MiniappRequestResult, type RequestTransport } from "./api-types"
import { getWechatSessionToken } from "./wechat-token"

export type PretripAttachment = { readonly id: string; readonly title: string; readonly contentType: string; readonly byteSize: number }
export type FamilyPretripPerson = {
  readonly orderLineId: string
  readonly displayName: string
  readonly vehicleStatus: "unconfirmed" | "stale" | "unassigned" | "assigned"
  readonly vehicle: null | { readonly sequence: number; readonly plateNumber: string; readonly guideName: string | null; readonly guidePhone: string | null; readonly driverName: string | null; readonly driverPhone: string | null }
}
export type FamilyPretrip = {
  readonly orderId: string
  readonly tourSessionId: string
  readonly config: null | {
    readonly gatheringAt: string | null
    readonly gatheringPlace: string
    readonly travelMode: "group" | "self" | "mixed"
    readonly itineraryNote: string
    readonly contactName: string
    readonly contactPhone: string
    readonly serviceContact: string
    readonly noticeVersionId: string | null
    readonly version: number
    readonly attachments: readonly PretripAttachment[]
  }
  readonly transportStatus: "unconfirmed" | "current" | "stale"
  readonly persons: readonly FamilyPretripPerson[]
}

export type PretripApiOptions = { readonly baseUrl?: string; readonly familyIdentityHeader?: string; readonly wechatSessionToken?: string; readonly request?: RequestTransport }

export function createPretripApi(options: PretripApiOptions = {}) {
  const baseUrl = resolveApiBaseUrl(options.baseUrl)
  const familyIdentityHeader = options.familyIdentityHeader ?? import.meta.env["VITE_DEV_FAMILY_IDENTITY_HEADER"]
  const wechatSessionToken = options.wechatSessionToken ?? getWechatSessionToken()
  const request = options.request ?? requestWithUni
  return {
    getPretrip: async (orderId: string) => parseFamilyPretrip(await requestJson(request, baseUrl, `/orders/${encodeURIComponent(orderId)}/pretrip`, "GET", familyIdentityHeader, wechatSessionToken)),
    createAttachmentUrl: async (orderId: string, attachmentId: string) => parseAttachmentUrl(await requestJson(request, baseUrl, `/orders/${encodeURIComponent(orderId)}/pretrip/attachments/${encodeURIComponent(attachmentId)}/url`, "POST", familyIdentityHeader, wechatSessionToken)),
  }
}

function resolveApiBaseUrl(baseUrl?: string): string {
  const configured = baseUrl ?? import.meta.env["VITE_API_BASE_URL"]
  return typeof configured === "string" && configured.length > 0 ? configured.replace(/\/$/, "") : FALLBACK_API_BASE_URL
}

async function requestWithUni(options: MiniappRequestOptions): Promise<MiniappRequestResult> {
  return await new Promise((resolve, reject) => uni.request({ ...options, success: resolve, fail: reject }))
}

async function requestJson(request: RequestTransport, baseUrl: string, path: string, method: MiniappRequestOptions["method"], familyIdentityHeader: string | undefined, wechatSessionToken: string | undefined): Promise<unknown> {
  const header: Record<string, string> = {}
  if (familyIdentityHeader !== undefined && familyIdentityHeader.length > 0) header[DEV_FAMILY_IDENTITY_HEADER] = familyIdentityHeader
  if (wechatSessionToken !== undefined) header["Authorization"] = `Bearer ${wechatSessionToken}`
  const response = await request({ url: `${baseUrl}${path}`, method, header })
  if (response.statusCode < 200 || response.statusCode >= 300) throw new ApiError(response.statusCode, readErrorMessage(response.data) ?? `request failed (${response.statusCode})`)
  return response.data
}

function parseFamilyPretrip(value: unknown): FamilyPretrip {
  const record = readRecord(value, "pretrip")
  return {
    orderId: readString(record, "orderId", "pretrip"),
    tourSessionId: readString(record, "tourSessionId", "pretrip"),
    config: parseConfig(record["config"]),
    transportStatus: readTransportStatus(record, "transportStatus"),
    persons: readArray(record, "persons", "pretrip").map(parsePerson),
  }
}

function parseConfig(value: unknown): FamilyPretrip["config"] {
  if (value === null) return null
  const record = readRecord(value, "pretrip.config")
  return {
    gatheringAt: readNullableString(record, "gatheringAt", "pretrip.config"),
    gatheringPlace: readString(record, "gatheringPlace", "pretrip.config"),
    travelMode: readTravelMode(record, "travelMode"),
    itineraryNote: readString(record, "itineraryNote", "pretrip.config"),
    contactName: readString(record, "contactName", "pretrip.config"),
    contactPhone: readString(record, "contactPhone", "pretrip.config"),
    serviceContact: readString(record, "serviceContact", "pretrip.config"),
    noticeVersionId: readNullableString(record, "noticeVersionId", "pretrip.config"),
    version: readNumber(record, "version", "pretrip.config"),
    attachments: readArray(record, "attachments", "pretrip.config").map(parseAttachment),
  }
}

function parsePerson(value: unknown): FamilyPretripPerson {
  const record = readRecord(value, "pretrip.person")
  const status = readVehicleStatus(record, "vehicleStatus")
  return { orderLineId: readString(record, "orderLineId", "pretrip.person"), displayName: readString(record, "displayName", "pretrip.person"), vehicleStatus: status, vehicle: parseVehicle(record["vehicle"]) }
}

function parseVehicle(value: unknown): FamilyPretripPerson["vehicle"] {
  if (value === null) return null
  const record = readRecord(value, "pretrip.vehicle")
  return { sequence: readNumber(record, "sequence", "pretrip.vehicle"), plateNumber: readString(record, "plateNumber", "pretrip.vehicle"), guideName: readNullableString(record, "guideName", "pretrip.vehicle"), guidePhone: readNullableString(record, "guidePhone", "pretrip.vehicle"), driverName: readNullableString(record, "driverName", "pretrip.vehicle"), driverPhone: readNullableString(record, "driverPhone", "pretrip.vehicle") }
}

function parseAttachment(value: unknown): PretripAttachment {
  const record = readRecord(value, "pretrip.attachment")
  return { id: readString(record, "id", "pretrip.attachment"), title: readString(record, "title", "pretrip.attachment"), contentType: readString(record, "contentType", "pretrip.attachment"), byteSize: readNumber(record, "byteSize", "pretrip.attachment") }
}

function parseAttachmentUrl(value: unknown): { readonly url: string; readonly expiresAt: string } {
  const record = readRecord(value, "pretrip.attachmentUrl")
  return { url: readString(record, "url", "pretrip.attachmentUrl"), expiresAt: readString(record, "expiresAt", "pretrip.attachmentUrl") }
}

function readRecord(value: unknown, itemName: string): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return Object.fromEntries(Object.entries(value))
  throw invalid(itemName)
}
function readArray(record: Record<string, unknown>, key: string, itemName: string): readonly unknown[] { const value = record[key]; if (Array.isArray(value)) return value; throw invalid(`${itemName}.${key}`) }
function readString(record: Record<string, unknown>, key: string, itemName: string): string { const value = record[key]; if (typeof value === "string") return value; throw invalid(`${itemName}.${key}`) }
function readNullableString(record: Record<string, unknown>, key: string, itemName: string): string | null { const value = record[key]; if (value === null) return null; if (typeof value === "string") return value; throw invalid(`${itemName}.${key}`) }
function readNumber(record: Record<string, unknown>, key: string, itemName: string): number { const value = record[key]; if (typeof value === "number" && Number.isFinite(value)) return value; throw invalid(`${itemName}.${key}`) }
function readTravelMode(record: Record<string, unknown>, key: string): "group" | "self" | "mixed" { const value = record[key]; if (value === "group" || value === "self" || value === "mixed") return value; throw invalid(`pretrip.config.${key}`) }
function readTransportStatus(record: Record<string, unknown>, key: string): FamilyPretrip["transportStatus"] { const value = record[key]; if (value === "unconfirmed" || value === "current" || value === "stale") return value; throw invalid(`pretrip.${key}`) }
function readVehicleStatus(record: Record<string, unknown>, key: string): FamilyPretripPerson["vehicleStatus"] { const value = record[key]; if (value === "unconfirmed" || value === "stale" || value === "unassigned" || value === "assigned") return value; throw invalid(`pretrip.person.${key}`) }
function readErrorMessage(value: unknown): string | undefined { if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined; const message = Object.fromEntries(Object.entries(value))["message"]; return typeof message === "string" ? message : undefined }
function invalid(field: string): ApiError { return new ApiError(0, `${field} response format is invalid`) }
