import { ApiError } from "./api-error"
import { readCollection, readErrorMessage, readRecord, readString } from "./api-parsers"
import {
  DEV_FAMILY_IDENTITY_HEADER,
  type MiniappRequestOptions,
  type MiniappRequestResult,
  type RequestTransport,
} from "./api-types"
import { resolveApiBaseUrl, resolveDevFamilyIdentityHeader } from "./api"
import { getWechatSessionToken } from "./wechat-token"

export type AlbumAsset = {
  readonly id: string
  readonly tourSessionId: string
  readonly title: string
  readonly kind: "image" | "video"
  readonly contentType: string
  readonly byteSize: number
  readonly status: "published"
  readonly version: number
  readonly authorStaffId: string
  readonly createdAt: string
  readonly cleanupPending: false
  readonly contentUrl: string
}

export type AlbumProvider = {
  readonly kind: "album" | "live"
  readonly label: string
  readonly url: string
  readonly enabled: true
  readonly version: number
}

export type AlbumCollection = {
  readonly assets: readonly AlbumAsset[]
  readonly providers: readonly AlbumProvider[]
}

export type AlbumApiOptions = {
  readonly baseUrl?: string
  readonly familyIdentityHeader?: string
  readonly wechatSessionToken?: string
  readonly request?: RequestTransport
}

export type AlbumApi = {
  readonly getOrderAlbum: (orderId: string) => Promise<AlbumCollection>
}

export function createAlbumApi(options: AlbumApiOptions = {}): AlbumApi {
  const baseUrl = resolveApiBaseUrl(options.baseUrl)
  const familyIdentityHeader = resolveDevFamilyIdentityHeader(options.familyIdentityHeader)
  const wechatSessionToken = options.wechatSessionToken ?? getWechatSessionToken()
  const request = options.request ?? requestWithUni

  return {
    getOrderAlbum: async (orderId) => parseAlbumCollection(await requestJson(
      request,
      baseUrl,
      `/orders/${encodeURIComponent(orderId)}/media`,
      familyIdentityHeader,
      wechatSessionToken,
    )),
  }
}

export function albumContentUrl(baseUrl: string | undefined, orderId: string, assetId: string): string {
  return `${resolveApiBaseUrl(baseUrl)}/orders/${encodeURIComponent(orderId)}/media/${encodeURIComponent(assetId)}/content`
}

export function parseAlbumCollection(value: unknown): AlbumCollection {
  const record = readRecord(value)
  return {
    assets: readCollection(record["assets"], parseAlbumAsset),
    providers: readCollection(record["providers"], parseAlbumProvider),
  }
}

function parseAlbumAsset(value: unknown): AlbumAsset {
  const record = readRecord(value)
  const kind = readString(record, "kind")
  const status = readString(record, "status")
  const cleanupPending = record["cleanupPending"]
  const contentUrl = readString(record, "contentUrl")
  if (kind !== "image" && kind !== "video") throw new ApiError(0, "活动影像暂时无法读取，请稍后再试。")
  if (status !== "published") throw new ApiError(0, "活动影像暂时无法读取，请稍后再试。")
  if (cleanupPending !== false) throw new ApiError(0, "活动影像暂时无法读取，请稍后再试。")
  if (!contentUrl.startsWith("https://")) throw new ApiError(0, "活动影像暂时无法读取，请稍后再试。")
  return {
    id: readString(record, "id"),
    tourSessionId: readString(record, "tourSessionId"),
    title: readString(record, "title"),
    kind,
    contentType: readString(record, "contentType"),
    byteSize: readSafeInteger(record, "byteSize"),
    status,
    version: readSafeInteger(record, "version"),
    authorStaffId: readString(record, "authorStaffId"),
    createdAt: readString(record, "createdAt"),
    cleanupPending,
    contentUrl,
  }
}

function parseAlbumProvider(value: unknown): AlbumProvider {
  const record = readRecord(value)
  const kind = readString(record, "kind")
  const enabled = record["enabled"]
  const url = readString(record, "url")
  if (kind !== "album" && kind !== "live") throw new ApiError(0, "活动影像暂时无法读取，请稍后再试。")
  if (enabled !== true) throw new ApiError(0, "活动影像暂时无法读取，请稍后再试。")
  if (!/^https:\/\/(?![^/]*@)(?:[a-z0-9-]+\.)+[a-z][a-z0-9-]*(?::443)?(?:[/?#]|$)/i.test(url)) throw new ApiError(0, "活动影像暂时无法读取，请稍后再试。")
  return {
    kind,
    label: readString(record, "label"),
    url,
    enabled,
    version: readSafeInteger(record, "version"),
  }
}

function readSafeInteger(record: Record<string, unknown>, field: string): number {
  const value = record[field]
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value
  throw new ApiError(0, "活动影像暂时无法读取，请稍后再试。")
}

async function requestWithUni(options: MiniappRequestOptions): Promise<MiniappRequestResult> {
  return await new Promise((resolve, reject) => {
    uni.request({
      url: options.url,
      method: options.method,
      header: options.header,
      success: resolve,
      fail: reject,
    })
  })
}

async function requestJson(
  request: RequestTransport,
  baseUrl: string,
  path: string,
  familyIdentityHeader: string | undefined,
  wechatSessionToken: string | undefined,
): Promise<unknown> {
  const response = await request({
    url: `${baseUrl}${path}`,
    method: "GET",
    header: buildHeaders(familyIdentityHeader, wechatSessionToken),
  })
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new ApiError(response.statusCode, readErrorMessage(response.data) ?? "服务暂时无法响应，请稍后再试。")
  }
  return response.data
}

function buildHeaders(familyIdentityHeader: string | undefined, wechatSessionToken: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {}
  if (familyIdentityHeader !== undefined) headers[DEV_FAMILY_IDENTITY_HEADER] = familyIdentityHeader
  if (wechatSessionToken !== undefined) headers["Authorization"] = `Bearer ${wechatSessionToken}`
  return headers
}
