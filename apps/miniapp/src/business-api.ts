import { ApiError } from "./api-error"
import { FALLBACK_API_BASE_URL, type MiniappRequestResult } from "./api-types"
import { readErrorMessage } from "./api-parsers"

export type BusinessCategory = "tourism" | "wellness" | "homestay"
export type BusinessMedia = { readonly kind: "image" | "video"; readonly url: string }
export type BusinessProduct = {
  readonly id: string
  readonly organizationId: string
  readonly category: BusinessCategory
  readonly title: string
  readonly offering: string
  readonly content: string
  readonly referencePriceFen: number | null
  readonly customerServicePhone: string
  readonly bookingUrl: string
  readonly bookingAuthorized: boolean
  readonly media: readonly BusinessMedia[]
  readonly mediaAuthorized: boolean
  readonly status: "published"
  readonly version: number
  readonly createdAt: string
  readonly updatedAt: string
}
export type BusinessInquiryInput = {
  readonly idempotencyKey: string
  readonly customerType: "individual" | "organization"
  readonly organizationName: string
  readonly contactName: string
  readonly phone: string
  readonly request: string
}
export type BusinessInquiryReceipt = { readonly id: string; readonly status: "received" }
export type BusinessRequestOptions = {
  readonly url: string
  readonly method: "GET" | "POST"
  readonly header: Record<string, string>
  readonly data?: object
}
export type BusinessRequestTransport = (options: BusinessRequestOptions) => Promise<MiniappRequestResult>
export type BusinessApi = {
  readonly listProducts: (category: BusinessCategory) => Promise<readonly BusinessProduct[]>
  readonly getProduct: (id: string) => Promise<BusinessProduct>
  readonly submitInquiry: (id: string, input: BusinessInquiryInput) => Promise<BusinessInquiryReceipt>
}
export type BusinessApiOptions = { readonly baseUrl?: string; readonly request?: BusinessRequestTransport }

export function createBusinessApi(options: BusinessApiOptions = {}): BusinessApi {
  const baseUrl = resolveApiBaseUrl(options.baseUrl)
  const request = options.request ?? requestWithUni
  return {
    listProducts: async (category) => readArray(await requestJson(request, baseUrl, `/business/products?category=${category}`, "GET"), parseProduct),
    getProduct: async (id) => parseProduct(await requestJson(request, baseUrl, `/business/products/${encodeURIComponent(id)}`, "GET")),
    submitInquiry: async (id, input) => parseReceipt(await requestJson(request, baseUrl, `/business/products/${encodeURIComponent(id)}/inquiries`, "POST", input)),
  }
}

function resolveApiBaseUrl(baseUrl?: string): string {
  const configured = baseUrl ?? import.meta.env["VITE_API_BASE_URL"]
  return typeof configured === "string" && configured.length > 0 ? configured.replace(/\/$/, "") : FALLBACK_API_BASE_URL
}

async function requestWithUni(options: BusinessRequestOptions): Promise<MiniappRequestResult> {
  return await new Promise((resolve, reject) => {
    const requestOptions: UniApp.RequestOptions = { url: options.url, method: options.method, header: options.header, success: resolve, fail: reject }
    if (options.data !== undefined) requestOptions.data = JSON.stringify(options.data)
    uni.request(requestOptions)
  })
}

async function requestJson(request: BusinessRequestTransport, baseUrl: string, path: string, method: "GET" | "POST", data?: object): Promise<unknown> {
  const response = await request(data === undefined
    ? { url: `${baseUrl}${path}`, method, header: {} }
    : { url: `${baseUrl}${path}`, method, header: { "Content-Type": "application/json" }, data })
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new ApiError(response.statusCode, readErrorMessage(response.data) ?? `请求失败（${response.statusCode}）`)
  }
  return response.data
}

function parseProduct(value: unknown): BusinessProduct {
  const record = readRecord(value)
  const status = record["status"]
  if (status !== "published") throw invalidResponse()
  return {
    id: readText(record, "id"),
    organizationId: readText(record, "organizationId"),
    category: readCategory(record["category"]),
    title: readText(record, "title"),
    offering: readText(record, "offering"),
    content: readText(record, "content"),
    referencePriceFen: readNullableCount(record, "referencePriceFen"),
    customerServicePhone: readText(record, "customerServicePhone"),
    bookingUrl: readText(record, "bookingUrl"),
    bookingAuthorized: readBoolean(record, "bookingAuthorized"),
    media: readArray(record["media"], parseMedia),
    mediaAuthorized: readBoolean(record, "mediaAuthorized"),
    status,
    version: readCount(record, "version"),
    createdAt: readText(record, "createdAt"),
    updatedAt: readText(record, "updatedAt"),
  }
}

function parseReceipt(value: unknown): BusinessInquiryReceipt {
  const record = readRecord(value)
  if (record["status"] !== "received") throw invalidResponse()
  return { id: readText(record, "id"), status: "received" }
}

function parseMedia(value: unknown): BusinessMedia {
  const record = readRecord(value)
  const kind = record["kind"]
  const url = readText(record, "url")
  if ((kind !== "image" && kind !== "video") || !url.startsWith("https://")) throw invalidResponse()
  return { kind, url }
}

function readArray<T>(value: unknown, parse: (item: unknown) => T): readonly T[] {
  if (!Array.isArray(value)) throw invalidResponse()
  return value.map(parse)
}

function readRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value
  throw invalidResponse()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
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

function readNullableCount(record: Record<string, unknown>, key: string): number | null {
  const value = record[key]
  if (value === null) return null
  return readCount(record, key)
}

function readBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key]
  if (typeof value === "boolean") return value
  throw invalidResponse()
}

function readCategory(value: unknown): BusinessCategory {
  if (value === "tourism" || value === "wellness" || value === "homestay") return value
  throw invalidResponse()
}

function invalidResponse(): ApiError {
  return new ApiError(0, "业务内容响应格式不正确")
}
