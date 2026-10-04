import { BadRequestException } from "@nestjs/common"
import type { BusinessCategory, BusinessMedia, FollowupInput, InquiryInput, ProductInput } from "./business.types.js"

export function businessInputError(message: string): BadRequestException {
  return new BadRequestException({ code: "business_invalid_input", message })
}
function record(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw businessInputError("输入格式不正确")
  const parsed: Record<string, unknown> = { ...value }
  if (Object.keys(parsed).some(key => !fields.includes(key))) throw businessInputError("包含不支持的字段")
  return parsed
}
function text(value: unknown, field: string, max: number, optional = false): string {
  if (typeof value !== "string" || value.trim().length > max || (!optional && !value.trim())) throw businessInputError(`${field}填写不正确`)
  return value.trim()
}
export function parseCategory(value: unknown): BusinessCategory {
  if (value === "tourism" || value === "wellness" || value === "homestay") return value
  throw businessInputError("业务分类不正确")
}
export function parseVersion(value: unknown): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value
  throw businessInputError("记录版本不正确，请刷新")
}
export function parseCustomerLink(value: unknown): { readonly customerId: string | null; readonly expectedVersion: number } {
  const body = record(value, ["customerId", "expectedVersion"])
  return { customerId: body["customerId"] === null ? null : text(body["customerId"], "既有客户", 64), expectedVersion: parseVersion(body["expectedVersion"]) }
}
export function publicUrl(value: unknown): string {
  const url = text(value, "链接", 2048, true)
  if (!url) return ""
  let parsed: URL
  try { parsed = new URL(url) } catch (error) {
    if (error instanceof TypeError) throw businessInputError("链接必须是有效的 HTTPS 地址")
    throw error
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port ||
    !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(parsed.hostname) || /(?:^|\.)(?:localhost|local|internal)$/i.test(parsed.hostname) ||
    /^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname) ||
    [...parsed.searchParams.keys()].some(key => /signature|token|credential|authorization|q-sign|x-cos|x-amz/i.test(key))) {
    throw businessInputError("只允许公开 HTTPS 地址，不能使用脚本、内部或私有签名链接")
  }
  return parsed.href
}
export function parseProduct(value: unknown): ProductInput {
  const body = record(value, ["organizationId", "category", "title", "offering", "content", "referencePriceFen", "customerServicePhone", "bookingUrl", "bookingAuthorized", "media", "mediaAuthorized", "status", "expectedVersion"])
  const price = body["referencePriceFen"]
  if (price !== null && (typeof price !== "number" || !Number.isSafeInteger(price) || price < 0 || price > 100000000)) throw businessInputError("参考价格须为有效的非负整数分")
  const status = body["status"]
  if (status !== "draft" && status !== "published" && status !== "archived") throw businessInputError("发布状态不正确")
  const bookingUrl = publicUrl(body["bookingUrl"])
  const bookingAuthorized = body["bookingAuthorized"] === true
  const mediaAuthorized = body["mediaAuthorized"] === true
  if (bookingUrl && !bookingAuthorized) throw businessInputError("请确认预订入口已获授权")
  const mediaInput = body["media"]
  if (!Array.isArray(mediaInput) || mediaInput.length > 8) throw businessInputError("素材最多八项")
  const media: BusinessMedia[] = mediaInput.map(item => {
    const entry = record(item, ["kind", "url"])
    const kind = entry["kind"]
    if (kind !== "image" && kind !== "video") throw businessInputError("素材类型不正确")
    const url = publicUrl(entry["url"])
    if (!url || !mediaAuthorized) throw businessInputError("请提供已授权的公开素材地址")
    return { kind, url }
  })
  const phone = text(body["customerServicePhone"], "客服电话", 32, true)
  if (phone && !/^[+\d][\d ()-]{5,31}$/.test(phone)) throw businessInputError("客服电话格式不正确")
  return { organizationId: text(body["organizationId"], "所属机构", 64), category: parseCategory(body["category"]),
    title: text(body["title"], "标题", 160), offering: text(body["offering"], "线路/套餐/房型", 500),
    content: text(body["content"], "介绍", 8000), referencePriceFen: price, customerServicePhone: phone,
    bookingUrl, bookingAuthorized, media, mediaAuthorized, status }
}
export function parseInquiry(value: unknown): InquiryInput {
  const body = record(value, ["idempotencyKey", "customerType", "organizationName", "contactName", "phone", "request"])
  const customerType = body["customerType"]
  if (customerType !== "individual" && customerType !== "organization") throw businessInputError("咨询对象须为个人或单位")
  const organizationName = text(body["organizationName"], "单位名称", 160, customerType === "individual")
  const phone = text(body["phone"], "联系电话", 32)
  if (!/^1[3-9]\d{9}$/.test(phone)) throw businessInputError("请填写有效手机号")
  return { idempotencyKey: text(body["idempotencyKey"], "提交编号", 64), customerType, organizationName,
    contactName: text(body["contactName"], "联系人", 80), phone, request: text(body["request"], "咨询需求", 2000) }
}
export function parseFollowup(value: unknown): FollowupInput {
  const body = record(value, ["idempotencyKey", "expectedVersion", "status", "ownerStaffAccountId", "note"])
  const status = body["status"]
  if (status !== "inquiry" && status !== "processing" && status !== "closed") throw businessInputError("仅支持咨询、处理中、已结束")
  return { idempotencyKey: text(body["idempotencyKey"], "提交编号", 64), expectedVersion: parseVersion(body["expectedVersion"]),
    status, ownerStaffAccountId: text(body["ownerStaffAccountId"], "负责人", 64), note: text(body["note"], "跟进记录", 2000) }
}
