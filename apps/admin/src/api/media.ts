import { ApiError } from "./configuration.errors"

export type MediaKind = "image" | "video"
export type MediaStatus = "uploading" | "draft" | "published" | "failed"
export type MediaAsset = {
  readonly id: string
  readonly tourSessionId: string
  readonly title: string
  readonly kind: MediaKind
  readonly contentType: string
  readonly byteSize: number
  readonly status: MediaStatus
  readonly version: number
  readonly authorStaffId: string
  readonly createdAt: string
  readonly cleanupPending: boolean
}
export type MediaProvider = { readonly kind: "album" | "live"; readonly label: string; readonly url: string; readonly enabled: boolean; readonly version: number }
export type MediaCollection = { readonly assets: readonly MediaAsset[]; readonly providers: readonly MediaProvider[] }
export type MediaSession = { readonly id: string; readonly code: string }
export type MediaProviderPayload = { readonly kind: "album" | "live"; readonly label: string; readonly url: string; readonly enabled: boolean; readonly expectedVersion: number }

const apiBaseUrl = import.meta.env["VITE_API_BASE_URL"] ?? "http://127.0.0.1:3000"

export async function listMediaSessions(): Promise<readonly MediaSession[]> {
  const value = await request("/staff/media/sessions")
  if (!Array.isArray(value)) throw invalidResponse()
  return value.map(parseSession)
}

export async function getMediaCollection(sessionId: string): Promise<MediaCollection> {
  return parseCollection(await request(`/staff/media/sessions/${encodeURIComponent(sessionId)}`))
}

export async function uploadMediaAsset(sessionId: string, input: { readonly file: File; readonly title: string; readonly requestId: string }): Promise<MediaAsset> {
  const body = new FormData()
  body.append("file", input.file)
  body.append("title", input.title)
  body.append("requestId", input.requestId)
  return parseAsset(await request(`/staff/media/sessions/${encodeURIComponent(sessionId)}/assets`, { method: "POST", body }))
}

export async function updateMediaStatus(sessionId: string, asset: MediaAsset, status: "draft" | "published"): Promise<MediaAsset> {
  return parseAsset(await request(`/staff/media/sessions/${encodeURIComponent(sessionId)}/assets/${encodeURIComponent(asset.id)}/status`, jsonRequest("PATCH", { status, expectedVersion: asset.version })))
}

export async function deleteMediaAsset(sessionId: string, asset: MediaAsset): Promise<void> {
  await request(`/staff/media/sessions/${encodeURIComponent(sessionId)}/assets/${encodeURIComponent(asset.id)}?expectedVersion=${asset.version}`, { method: "DELETE" })
}

export async function saveMediaProvider(sessionId: string, payload: MediaProviderPayload): Promise<MediaProvider> {
  return parseProvider(await request(`/staff/media/sessions/${encodeURIComponent(sessionId)}/providers`, jsonRequest("PATCH", payload)))
}

export function mediaContentUrl(sessionId: string, assetId: string): string {
  return `${apiBaseUrl}/staff/media/sessions/${encodeURIComponent(sessionId)}/assets/${encodeURIComponent(assetId)}/content`
}

export function readableMediaError(error: unknown): string {
  return error instanceof ApiError ? error.message : "素材操作失败，请稍后重试。"
}

async function request(path: string, init: RequestInit = { method: "GET" }): Promise<unknown> {
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, credentials: "include" })
  if (response.status === 204) return undefined
  let value: unknown
  try { value = await response.json() }
  catch (error) {
    if (error instanceof SyntaxError) value = undefined
    else throw error
  }
  if (!response.ok) throw new ApiError(response.status, readErrorMessage(value) ?? `请求失败（${response.status}）`)
  return value
}

function jsonRequest(method: "PATCH", payload: object): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
}

function parseCollection(value: unknown): MediaCollection {
  const record = readRecord(value)
  const assets = record["assets"]
  const providers = record["providers"]
  if (!Array.isArray(assets) || !Array.isArray(providers)) throw invalidResponse()
  return { assets: assets.map(parseAsset), providers: providers.map(parseProvider) }
}

function parseSession(value: unknown): MediaSession {
  const record = readRecord(value)
  return { id: readText(record, "id"), code: readText(record, "code") }
}

function parseAsset(value: unknown): MediaAsset {
  const record = readRecord(value)
  const kind = record["kind"]
  const status = record["status"]
  if ((kind !== "image" && kind !== "video") || (status !== "uploading" && status !== "draft" && status !== "published" && status !== "failed")) throw invalidResponse()
  return {
    id: readText(record, "id"),
    tourSessionId: readText(record, "tourSessionId"),
    title: readText(record, "title"),
    kind,
    contentType: readText(record, "contentType"),
    byteSize: readCount(record, "byteSize"),
    status,
    version: readCount(record, "version"),
    authorStaffId: readText(record, "authorStaffId"),
    createdAt: readText(record, "createdAt"),
    cleanupPending: readBoolean(record, "cleanupPending"),
  }
}

function parseProvider(value: unknown): MediaProvider {
  const record = readRecord(value)
  const kind = record["kind"]
  if (kind !== "album" && kind !== "live") throw invalidResponse()
  return { kind, label: readText(record, "label"), url: readText(record, "url"), enabled: readBoolean(record, "enabled"), version: readCount(record, "version") }
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return value as Record<string, unknown>
  throw invalidResponse()
}

function readText(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value === "string") return value
  throw invalidResponse()
}

function readCount(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value
  throw invalidResponse()
}

function readBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key]
  if (typeof value === "boolean") return value
  throw invalidResponse()
}

function readErrorMessage(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined
  const message = Object.fromEntries(Object.entries(value))["message"]
  return typeof message === "string" ? message : undefined
}

function invalidResponse(): ApiError {
  return new ApiError(0, "素材响应格式不正确")
}
