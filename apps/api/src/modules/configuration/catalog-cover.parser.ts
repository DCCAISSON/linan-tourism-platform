import { BadRequestException, NotFoundException, PayloadTooLargeException } from "@nestjs/common"

export const CATALOG_COVER_MAX_BYTES = 5 * 1024 * 1024

export type CatalogCoverUpload = {
  readonly body: Buffer
  readonly contentType: "image/png" | "image/jpeg" | "image/webp"
  readonly extension: "png" | "jpg" | "webp"
}

export type CatalogCoverFile = {
  readonly filename: string
  readonly contentType: CatalogCoverUpload["contentType"]
}

export function parseCatalogCoverUpload(file: unknown, body: unknown): CatalogCoverUpload {
  if (typeof body !== "object" || body === null || Array.isArray(body) || Object.keys(body).length > 0) throw invalid("封面上传只接受图片文件")
  if (typeof file !== "object" || file === null) throw invalid("请选择封面图片")
  const input = Object.fromEntries(Object.entries(file))
  const bytes = input["buffer"]
  const contentType = input["mimetype"]
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || input["size"] !== bytes.length) throw invalid("封面图片内容或大小不正确")
  if (bytes.length > CATALOG_COVER_MAX_BYTES) throw new PayloadTooLargeException({ code: "catalog_cover_too_large", message: "封面图片不能超过5MB" })
  if (contentType === "image/png" && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return { body: bytes, contentType, extension: "png" }
  if (contentType === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { body: bytes, contentType, extension: "jpg" }
  if (contentType === "image/webp" && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return { body: bytes, contentType, extension: "webp" }
  throw invalid("封面仅支持内容与类型一致的PNG、JPEG、WebP图片")
}

export function parseCatalogCoverFilename(filename: string): CatalogCoverFile {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$/.test(filename)) {
    throw new NotFoundException({ code: "catalog_cover_not_found", message: "封面图片不存在" })
  }
  return { filename, contentType: filename.endsWith(".png") ? "image/png" : filename.endsWith(".jpg") ? "image/jpeg" : "image/webp" }
}

function invalid(message: string): BadRequestException {
  return new BadRequestException({ code: "catalog_cover_input_invalid", message })
}
