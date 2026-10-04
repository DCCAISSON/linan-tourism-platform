import { resolveAdminApiBaseUrl } from "./base-url"
import { RosterApiError } from "./roster.errors"

import type { BusinessCategory, BusinessStatus, InquiryStatus, CustomerType, BusinessMedia, BusinessProductInput, BusinessProduct, BusinessInquiry, BusinessFollowupInput, BusinessFollowupReceipt, BusinessInquiryDetail, BusinessOwner, BusinessOrganization, BusinessCustomerCandidate } from "./business.types"
export type * from "./business.types"

const apiBaseUrl = resolveAdminApiBaseUrl()

export async function listBusinessProducts(): Promise<readonly BusinessProduct[]> {
  return readArray(await request("/business/staff/products"), parseProduct)
}

export async function createBusinessProduct(input: BusinessProductInput): Promise<BusinessProduct> {
  return parseProduct(await request("/business/staff/products", input, "POST"))
}

export async function updateBusinessProduct(id: string, input: BusinessProductInput, expectedVersion: number): Promise<BusinessProduct> {
  return parseProduct(await request(`/business/staff/products/${encodeURIComponent(id)}`, { ...input, expectedVersion }, "PUT"))
}

export async function listBusinessInquiries(): Promise<readonly BusinessInquiry[]> {
  return readArray(await request("/business/staff/inquiries"), parseInquiry)
}

export async function getBusinessInquiry(id: string): Promise<BusinessInquiryDetail> {
  const record = readRecord(await request(`/business/staff/inquiries/${encodeURIComponent(id)}`))
  return { ...parseInquiry(record), linkedCustomer: record["linkedCustomer"] === null || record["linkedCustomer"] === undefined ? null : parseCustomerCandidate(record["linkedCustomer"]), customerHistory: readArray(record["customerHistory"] ?? [], value => {
    const row = readRecord(value)
    const action = row["action"]
    if (action !== "linked" && action !== "unlinked") throw invalidResponse()
    return { id: readText(row, "id"), customerId: readText(row, "customerId"), displayName: readText(row, "displayName"), action, actorId: readText(row, "actorId"), createdAt: readText(row, "createdAt") }
  }), productTitle: readText(record, "productTitle"), ownerDisplayName: readText(record, "ownerDisplayName"), history: readArray(record["history"], value => {
    const row = readRecord(value)
    return { id: readText(row, "id"), status: readInquiryStatus(row["status"]), note: readText(row, "note"), ownerDisplayName: readText(row, "ownerDisplayName"), createdAt: readText(row, "createdAt") }
  }) }
}

export async function listBusinessCustomerCandidates(id: string): Promise<readonly BusinessCustomerCandidate[]> {
  return readArray(await request(`/business/staff/inquiries/${encodeURIComponent(id)}/customer-candidates`), parseCustomerCandidate)
}

export async function linkBusinessCustomer(id: string, customerId: string | null, expectedVersion: number): Promise<void> {
  await request(`/business/staff/inquiries/${encodeURIComponent(id)}/customer`, { customerId, expectedVersion }, "PUT")
}

function parseCustomerCandidate(value: unknown): BusinessCustomerCandidate {
  const row = readRecord(value)
  return { id: readText(row, "id"), displayName: readText(row, "displayName"), phoneMasked: readText(row, "phoneMasked") }
}

export async function listBusinessOwners(id: string): Promise<readonly BusinessOwner[]> {
  return readArray(await request(`/business/staff/inquiries/${encodeURIComponent(id)}/owners`), value => {
    const row = readRecord(value)
    return { id: readText(row, "id"), displayName: readText(row, "displayName") }
  })
}

export async function listBusinessOrganizations(): Promise<readonly BusinessOrganization[]> {
  return readArray(await request("/business/staff/organizations"), value => {
    const row = readRecord(value)
    return { id: readText(row, "id"), name: readText(row, "name") }
  })
}

export async function followupBusinessInquiry(id: string, input: BusinessFollowupInput): Promise<BusinessFollowupReceipt> {
  const record = readRecord(await request(`/business/staff/inquiries/${encodeURIComponent(id)}/followups`, input, "POST"))
  return { id: readText(record, "id"), version: readCount(record, "version") }
}

export function readableBusinessError(error: unknown): string {
  return error instanceof RosterApiError ? error.message : "业务服务请求失败"
}

async function request(path: string, body?: object, method: "POST" | "PUT" = "POST"): Promise<unknown> {
  const init: RequestInit = body === undefined
    ? { method: "GET", credentials: "include" }
    : { method, headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) }
  const response = await fetch(`${apiBaseUrl}${path}`, init)
  let value: unknown
  try { value = await response.json() }
  catch (error) {
    if (error instanceof SyntaxError) throw new RosterApiError(response.status, "业务服务响应格式不正确")
    throw error
  }
  if (!response.ok) {
    const record = isRecord(value) ? value : {}
    const message = typeof record["message"] === "string" ? record["message"] : `请求失败（${response.status}）`
    throw new RosterApiError(response.status, message)
  }
  return value
}

function parseProduct(value: unknown): BusinessProduct {
  const record = readRecord(value)
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
    status: readStatus(record["status"]),
    version: readCount(record, "version"),
    createdAt: readText(record, "createdAt"),
    updatedAt: readText(record, "updatedAt"),
  }
}

function parseInquiry(value: unknown): BusinessInquiry {
  const record = readRecord(value)
  return {
    id: readText(record, "id"),
    productId: readText(record, "productId"),
    organizationId: readText(record, "organizationId"),
    customerType: readCustomerType(record["customerType"]),
    organizationName: readText(record, "organizationName"),
    contactName: readText(record, "contactName"),
    phone: readText(record, "phone"),
    request: readText(record, "request"),
    status: readInquiryStatus(record["status"]),
    ownerStaffAccountId: readNullableText(record, "ownerStaffAccountId"),
    version: readCount(record, "version"),
    createdAt: readText(record, "createdAt"),
    updatedAt: readText(record, "updatedAt"),
  }
}

function parseMedia(value: unknown): BusinessMedia {
  const record = readRecord(value)
  const kind = record["kind"]
  if (kind !== "image" && kind !== "video") throw invalidResponse()
  const url = readText(record, "url")
  if (!url.startsWith("https://")) throw invalidResponse()
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

function readNullableText(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  if (value === null || typeof value === "string") return value
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

function readStatus(value: unknown): BusinessStatus {
  if (value === "draft" || value === "published" || value === "archived") return value
  throw invalidResponse()
}

function readInquiryStatus(value: unknown): InquiryStatus {
  if (value === "inquiry" || value === "processing" || value === "closed") return value
  throw invalidResponse()
}

function readCustomerType(value: unknown): CustomerType {
  if (value === "individual" || value === "organization") return value
  throw invalidResponse()
}

function invalidResponse(): RosterApiError {
  return new RosterApiError(0, "业务内容响应格式不正确")
}
