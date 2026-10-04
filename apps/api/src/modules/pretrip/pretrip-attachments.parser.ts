import { BadRequestException } from "@nestjs/common"

export const PRETRIP_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
export type PretripAttachmentUpload = { readonly body: Buffer; readonly title: string; readonly contentType: string; readonly extension: string; readonly expectedVersion: number }

export function parsePretripAttachmentUpload(file: unknown, body: unknown): PretripAttachmentUpload {
  const input = record(file)
  const fields = record(body)
  const buffer = input["buffer"]
  const filename = input["originalname"]
  const mime = input["mimetype"]
  const title = fields["title"]
  const version = fields["expectedVersion"]
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > PRETRIP_ATTACHMENT_MAX_BYTES || input["size"] !== buffer.length) throw invalid("请选择不超过10MB的文件")
  if (typeof filename !== "string" || typeof mime !== "string") throw invalid("请选择PDF、图片或Word文件")
  if (typeof title !== "string" || title.trim().length === 0 || title.trim().length > 120 || [...title].some((character) => character.charCodeAt(0) < 32)) throw invalid("附件名称须为1至120字")
  if (typeof version !== "string" || !/^\d+$/.test(version) || !Number.isSafeInteger(Number(version))) throw invalid("请先读取最新行前配置")
  const extension = filename.split(".").at(-1)?.toLowerCase()
  const format = detectFormat(buffer, extension)
  if (mime !== format.contentType && mime !== "application/octet-stream" && mime !== "") throw invalid("文件类型与内容不匹配")
  return { body: buffer, title: title.trim(), expectedVersion: Number(version), ...format }
}

function detectFormat(buffer: Buffer, extension: string | undefined): { readonly extension: string; readonly contentType: string } {
  if (extension === "pdf" && buffer.toString("ascii", 0, 5) === "%PDF-") return { extension, contentType: "application/pdf" }
  if (extension === "png" && buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return { extension, contentType: "image/png" }
  if ((extension === "jpg" || extension === "jpeg") && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { extension: "jpg", contentType: "image/jpeg" }
  if (extension === "webp" && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return { extension, contentType: "image/webp" }
  if (extension === "doc" && buffer.subarray(0, 8).equals(Buffer.from("d0cf11e0a1b11ae1", "hex"))) return { extension, contentType: "application/msword" }
  if (extension === "docx" && buffer.subarray(0, 4).equals(Buffer.from("504b0304", "hex")) && buffer.includes(Buffer.from("word/document.xml")) && buffer.includes(Buffer.from("[Content_Types].xml"))) return { extension, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }
  throw invalid("文件内容与格式不符，仅支持PDF、PNG、JPEG、WebP、DOC和DOCX")
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalid("请选择文件并填写附件名称")
  return Object.fromEntries(Object.entries(value))
}

function invalid(message: string): BadRequestException {
  return new BadRequestException({ code: "pretrip_attachment_invalid", message })
}
