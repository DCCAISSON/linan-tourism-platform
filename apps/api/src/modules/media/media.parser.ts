import { BadRequestException } from "@nestjs/common"

export const MEDIA_MAX_BYTES = 50 * 1024 * 1024
export type MediaUpload = {
  readonly body: Buffer
  readonly title: string
  readonly requestId: string
  readonly contentType: string
  readonly kind: "image" | "video"
  readonly extension: string
}
export type MediaProviderInput = {
  readonly kind: "album" | "live"
  readonly label: string
  readonly url: string
  readonly enabled: boolean
  readonly expectedVersion: number
}

export function parseMediaUpload(file: unknown, body: unknown): MediaUpload {
  const record = mediaRecord(body, ["title", "requestId"])
  const requestId = mediaText(record, "requestId", 36)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) throw invalid("上传编号格式不正确")
  if (typeof file !== "object" || file === null) throw invalid("请选择图片或视频文件")
  const input = Object.fromEntries(Object.entries(file))
  const buffer = input["buffer"]
  const contentType = input["mimetype"]
  if (!Buffer.isBuffer(buffer) || typeof contentType !== "string") throw invalid("图片或视频类型不正确")
  const format = detectFormat(buffer, contentType)
  const limit = format.kind === "image" ? 10 * 1024 * 1024 : MEDIA_MAX_BYTES
  if (buffer.length === 0 || buffer.length > limit || input["size"] !== buffer.length) throw invalid("文件大小不符合要求：图片不超过10MB，视频不超过50MB")
  return { body: buffer, contentType, ...format, title: mediaText(record, "title", 120), requestId }
}

export function parseMediaProvider(body: unknown): MediaProviderInput {
  const record = mediaRecord(body, ["kind", "label", "url", "enabled", "expectedVersion"])
  const kind = record["kind"]
  const enabled = record["enabled"]
  if ((kind !== "album" && kind !== "live") || typeof enabled !== "boolean") throw invalid("入口类型或启用状态不正确")
  const rawUrl = mediaText(record, "url", 2000, !enabled)
  let url = ""
  if (rawUrl.length > 0) {
    try {
      const parsed = new URL(rawUrl)
      if (parsed.protocol !== "https:" || parsed.username || parsed.password || !parsed.hostname.includes(".") || /^(?:\d+\.){3}\d+$/.test(parsed.hostname) || parsed.hostname.includes(":")) throw invalid("入口只支持公开 HTTPS 地址，不能含用户名或密码")
      url = parsed.href
    } catch (error) {
      if (error instanceof BadRequestException) throw error
      if (error instanceof TypeError) throw invalid("入口只支持有效 HTTPS 地址")
      throw error
    }
  }
  return { kind, enabled, url, label: mediaText(record, "label", 80, !enabled), expectedVersion: mediaVersion(record) }
}

export function parseMediaStatus(body: unknown): { readonly status: "draft" | "published"; readonly expectedVersion: number } {
  const record = mediaRecord(body, ["status", "expectedVersion"])
  const status = record["status"]
  if (status !== "draft" && status !== "published") throw invalid("素材状态不正确")
  return { status, expectedVersion: mediaVersion(record) }
}

export function mediaRecord(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalid("请求格式不正确")
  const record = Object.fromEntries(Object.entries(value))
  if (Object.keys(record).some((key) => !allowed.includes(key))) throw invalid("请求包含不支持的字段")
  return record
}

export function mediaVersion(record: Record<string, unknown>): number {
  const version = record["expectedVersion"]
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 0) throw invalid("版本号不正确")
  return version
}

export function mediaId(value: string): string {
  if (!/^[\w-]{1,64}$/.test(value)) throw invalid("记录编号不正确")
  return value
}

function mediaText(record: Record<string, unknown>, key: string, maxLength: number, optional = false): string {
  const value = record[key]
  if (typeof value !== "string" || value.length > maxLength || (!optional && value.trim().length === 0) || Array.from(value).some((character) => character.charCodeAt(0) <= 0x1f)) throw invalid("文本格式或长度不正确")
  return value.trim()
}

function detectFormat(buffer: Buffer, contentType: string): { readonly kind: "image" | "video"; readonly extension: string } {
  if (contentType === "image/png" && buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return { kind: "image", extension: "png" }
  if (contentType === "image/jpeg" && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { kind: "image", extension: "jpg" }
  if (contentType === "image/webp" && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return { kind: "image", extension: "webp" }
  if (contentType === "video/mp4" && buffer.toString("ascii", 4, 8) === "ftyp") return { kind: "video", extension: "mp4" }
  if (contentType === "video/webm" && buffer.subarray(0, 4).equals(Buffer.from("1a45dfa3", "hex"))) return { kind: "video", extension: "webm" }
  throw invalid("图片或视频类型与文件内容不匹配；仅支持 PNG、JPEG、WebP、MP4、WebM")
}

function invalid(message: string): BadRequestException {
  return new BadRequestException({ code: "media_input_invalid", message })
}
