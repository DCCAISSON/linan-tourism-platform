import type { MediaAsset, MediaKind, MediaSession } from "@linan/contracts"
import { ApiError } from "./api-error"
import { readCollection, readNonNegativeInteger, readRecord, readString } from "./api-parsers"
import { FALLBACK_API_BASE_URL } from "./api-types"
import { createStaffRequest, type StaffRequestOptions } from "./staff-api"
import { clearStaffSession, getStaffSessionToken } from "./staff-session"

export type GuideMediaFile = { readonly path: string; readonly size: number; readonly kind: MediaKind }
export type GuideMediaUpload = { readonly file: GuideMediaFile; readonly title: string; readonly requestId: string }
export const mediaStatusLabels = { uploading: "上传处理中", draft: "草稿 · 家长不可见", published: "已发布 · 本团家长可见", failed: "上传失败 · 家长不可见" } as const

export function createGuideMediaApi(options: StaffRequestOptions = {}) {
  const request = createStaffRequest(options)
  const baseUrl = (options.baseUrl ?? import.meta.env["VITE_API_BASE_URL"] ?? FALLBACK_API_BASE_URL).replace(/\/$/, "")
  const path = (id: string) => `/staff/media/sessions/${encodeURIComponent(id)}`
  return {
    listSessions: async (): Promise<readonly MediaSession[]> => readCollection(await request("/staff/media/sessions"), value => {
      const row = readRecord(value)
      return { id: readString(row, "id"), code: readString(row, "code") }
    }),
    listAssets: async (sessionId: string): Promise<readonly MediaAsset[]> => readCollection(readRecord(await request(path(sessionId)))["assets"], parseAsset),
    setStatus: async (sessionId: string, asset: MediaAsset, status: "draft" | "published"): Promise<MediaAsset> => parseAsset(await request(`${path(sessionId)}/assets/${encodeURIComponent(asset.id)}/status`, "POST", { status, expectedVersion: asset.version })),
    remove: async (sessionId: string, asset: MediaAsset): Promise<void> => { await request(`${path(sessionId)}/assets/${encodeURIComponent(asset.id)}?expectedVersion=${asset.version}`, "DELETE") },
    upload: async (sessionId: string, input: GuideMediaUpload): Promise<MediaAsset> => {
      validateMediaFile(input.file)
      const title = input.title.trim()
      if (!title || title.length > 120 || Array.from(title).some(character => character.charCodeAt(0) <= 0x1f)) throw new ApiError(400, "请填写120字以内的素材标题。")
      const token = requireToken()
      const result = await new Promise<UniApp.UploadFileSuccessCallbackResult>((resolve, reject) => uni.uploadFile({
        url: `${baseUrl}${path(sessionId)}/assets`, name: "file", filePath: input.file.path,
        header: { Authorization: `Staff ${token}` }, formData: { title, requestId: input.requestId }, timeout: 120000,
        success: resolve, fail: () => reject(nativeFailure(token, "上传未完成，请检查网络后重试。")),
      }))
      assertSameToken(token)
      let value: unknown
      try { value = JSON.parse(result.data) }
      catch (error) { if (!(error instanceof SyntaxError)) throw error }
      assertNativeSuccess(result.statusCode, value, token)
      return parseAsset(value)
    },
    download: async (sessionId: string, assetId: string): Promise<string> => {
      const token = requireToken()
      const result = await new Promise<UniApp.DownloadSuccessData>((resolve, reject) => uni.downloadFile({
        url: `${baseUrl}${path(sessionId)}/assets/${encodeURIComponent(assetId)}/content`,
        header: { Authorization: `Staff ${token}` }, timeout: 120000,
        success: resolve, fail: () => reject(nativeFailure(token, "素材暂时无法打开，请检查网络后重试。")),
      }))
      assertSameToken(token)
      assertNativeSuccess(result.statusCode, undefined, token)
      return result.tempFilePath
    },
  }
}
export type GuideMediaApi = ReturnType<typeof createGuideMediaApi>

export function chooseGuideMedia(kind: MediaKind): Promise<GuideMediaFile | null> {
  return new Promise((resolve, reject) => uni.chooseMedia({
    count: 1, mediaType: [kind], sourceType: ["album", "camera"], sizeType: ["original"],
    success: result => {
      const file = result.tempFiles[0]
      if (!file) { resolve(null); return }
      const selected = { path: file.tempFilePath, size: file.size, kind: file.fileType }
      try { validateMediaFile(selected); resolve(selected) }
      catch (error) { reject(error) }
    },
    fail: error => /cancel/i.test(error.errMsg) ? resolve(null) : reject(new ApiError(0, "未能选择文件，请检查相册或相机权限后重试。")),
  }))
}

export function validateMediaFile(file: GuideMediaFile): void {
  const supported = file.kind === "image" ? /\.(png|jpe?g|webp)$/i : /\.(mp4|webm)$/i
  if (!supported.test(file.path.split(/[?#]/)[0] ?? "")) throw new ApiError(400, "仅支持 PNG、JPEG、WebP 图片和 MP4、WebM 视频，请重新选择。")
  const limit = (file.kind === "image" ? 10 : 50) * 1024 * 1024
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > limit) throw new ApiError(400, "图片不超过10MB，视频不超过50MB，且文件不能为空。")
}

function parseAsset(value: unknown): MediaAsset {
  const row = readRecord(value)
  const kind = row["kind"]
  const status = row["status"]
  const cleanupPending = row["cleanupPending"]
  if ((kind !== "image" && kind !== "video") || (status !== "uploading" && status !== "draft" && status !== "published" && status !== "failed") || typeof cleanupPending !== "boolean") throw new ApiError(0, "素材暂时无法读取，请刷新重试。")
  return { id: readString(row, "id"), tourSessionId: readString(row, "tourSessionId"), title: readString(row, "title"), kind, contentType: readString(row, "contentType"), byteSize: readNonNegativeInteger(row, "byteSize"), status, version: readNonNegativeInteger(row, "version"), authorStaffId: readString(row, "authorStaffId"), createdAt: readString(row, "createdAt"), cleanupPending }
}
function requireToken(): string {
  const token = getStaffSessionToken()
  if (token === undefined) throw new ApiError(401, "请登录导游账号。")
  return token
}
function assertSameToken(token: string): void {
  if (getStaffSessionToken() !== token) throw new ApiError(409, "账号已切换，请重新进入工作台。")
}
function nativeFailure(token: string, message: string): ApiError {
  return getStaffSessionToken() === token ? new ApiError(0, message) : new ApiError(409, "账号已切换，请重新进入工作台。")
}
function assertNativeSuccess(status: number, value: unknown, token: string): void {
  if (status >= 200 && status < 300) return
  if (status === 401) { clearStaffSession(token); throw new ApiError(401, "登录已失效，请重新登录。") }
  if (status === 403) throw new ApiError(403, "当前账号没有此项权限，请联系工作人员核对分配。")
  if (status === 413) throw new ApiError(413, "文件过大，图片不超过10MB，视频不超过50MB。")
  if (typeof value === "object" && value !== null && "message" in value && typeof value.message === "string" && /[\u4e00-\u9fff]/.test(value.message)) throw new ApiError(status, value.message)
  throw new ApiError(status, "素材操作未完成，请稍后重试。")
}
