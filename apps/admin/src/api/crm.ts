import { resolveAdminApiBaseUrl } from "./base-url"
import { malformed, parseCustomer, parseFollowup, parseHistory, parseList, parseOptions, parseOrganization, readErrorMessage, readRecord, readText } from "./crm.parsers"
import type { CrmCustomer, CrmCustomerDetail, CrmCustomerList, CrmCustomerPayload, CrmFilters, CrmFollowupPayload, CrmHistoryRow, CrmOptions, CrmOrganization, CrmUpdatePayload } from "./crm.types"

export type { CrmCustomer, CrmCustomerDetail, CrmCustomerList, CrmCustomerPayload, CrmFamilyOption, CrmFilters, CrmFollowup, CrmFollowupPayload, CrmHistoryRow, CrmOptions, CrmOrganization, CrmOwnerOption, CrmUpdatePayload, MarketingConsent } from "./crm.types"

const apiBaseUrl = resolveAdminApiBaseUrl()

export class CrmApiError extends Error {
  public readonly status: number

  public constructor(status: number, message: string) {
    super(message)
    this.name = "CrmApiError"
    this.status = status
  }
}

export async function listCrmOrganizations(): Promise<readonly CrmOrganization[]> {
  const value = await request("/staff/crm/organizations", { method: "GET" })
  if (!Array.isArray(value)) {
    throw malformed()
  }
  return value.map(parseOrganization)
}

export async function getCrmOptions(organizationId: string): Promise<CrmOptions> {
  const params = new URLSearchParams({ organizationId })
  return parseOptions(await request(`/staff/crm/options?${params.toString()}`, { method: "GET" }))
}

export async function listCrmCustomers(filters: CrmFilters): Promise<CrmCustomerList> {
  return parseList(await request(`/staff/crm/contacts?${buildQuery(filters)}`, { method: "GET" }))
}

export async function createCrmCustomer(payload: CrmCustomerPayload): Promise<CrmCustomer> {
  return parseCustomer(await request("/staff/crm/contacts", jsonRequest("POST", payload)))
}

export async function updateCrmCustomer(id: string, payload: CrmUpdatePayload): Promise<CrmCustomer> {
  return parseCustomer(await request(`/staff/crm/contacts/${encodeURIComponent(id)}`, jsonRequest("PATCH", payload)))
}

export async function getCrmDetail(id: string): Promise<CrmCustomerDetail> {
  const record = readRecord(await request(`/staff/crm/contacts/${encodeURIComponent(id)}`, { method: "GET" }))
  const followups = record["followups"]
  if (!Array.isArray(followups)) {
    throw malformed()
  }
  const inquiries = record["inquiries"] ?? []
  if (!Array.isArray(inquiries)) throw malformed()
  return { ...parseCustomer(record), followups: followups.map(parseFollowup), inquiries: inquiries.map(value => {
    const inquiry = readRecord(value)
    const history = inquiry["history"]
    const customerHistory = inquiry["customerHistory"]
    const linked = inquiry["linked"]
    if (!Array.isArray(history) || !Array.isArray(customerHistory) || typeof linked !== "boolean") throw malformed()
    return { id: readText(inquiry, "id"), productTitle: readText(inquiry, "productTitle"), request: readText(inquiry, "request"), status: readText(inquiry, "status"), linked, createdAt: readText(inquiry, "createdAt"),
      history: history.map(item => { const row = readRecord(item); return { id: readText(row, "id"), note: readText(row, "note"), status: readText(row, "status"), createdAt: readText(row, "createdAt") } }),
      customerHistory: customerHistory.map(item => {
        const row = readRecord(item)
        const action = row["action"]
        if (action !== "linked" && action !== "unlinked") throw malformed()
        return { id: readText(row, "id"), action, actorId: readText(row, "actorId"), createdAt: readText(row, "createdAt") }
      }),
    }
  }) }
}

export async function createCrmFollowup(id: string, payload: CrmFollowupPayload): Promise<{ readonly id: string }> {
  const record = readRecord(await request(`/staff/crm/contacts/${encodeURIComponent(id)}/followups`, jsonRequest("POST", payload)))
  return { id: readText(record, "id") }
}

export async function getCrmHistory(id: string): Promise<readonly CrmHistoryRow[]> {
  const value = await request(`/staff/crm/contacts/${encodeURIComponent(id)}/history`, { method: "GET" })
  if (!Array.isArray(value)) {
    throw malformed()
  }
  return value.map(parseHistory)
}

export async function readCrmPhone(id: string, reason: string): Promise<string> {
  const params = new URLSearchParams({ reason })
  const record = readRecord(await request(`/staff/crm/contacts/${encodeURIComponent(id)}/contact?${params.toString()}`, { method: "GET" }))
  return readText(record, "phone")
}

export async function downloadCrmExport(filters: CrmFilters): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/staff/crm/export.csv?${buildQuery(filters)}`, { method: "GET", credentials: "include" })
  if (!response.ok) {
    throw new CrmApiError(response.status, readErrorMessage(await readJson(response)) ?? `请求失败（${response.status}）`)
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `成人CRM-${filters.organizationId}.csv`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function readableCrmError(error: unknown): string {
  if (error instanceof CrmApiError) {
    return error.message
  }
  if (error instanceof TypeError) {
    return "无法连接服务器"
  }
  throw error
}

function buildQuery(filters: CrmFilters): string {
  const params = new URLSearchParams({ organizationId: filters.organizationId })
  appendOptional(params, "keyword", filters.keyword)
  appendOptional(params, "tag", filters.tag)
  appendOptional(params, "ownerId", filters.ownerId)
  appendOptional(params, "marketingConsent", filters.marketingConsent)
  if (filters.dueOnly === true) {
    params.set("dueOnly", "true")
  }
  if (filters.page !== undefined) {
    params.set("page", String(filters.page))
  }
  return params.toString()
}

function appendOptional(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value !== undefined && value.trim().length > 0) {
    params.set(key, value.trim())
  }
}

function jsonRequest(method: "POST" | "PATCH", payload: object): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), credentials: "include" }
}

async function request(path: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, credentials: "include" })
  const value = await readJson(response)
  if (!response.ok) {
    throw new CrmApiError(response.status, readErrorMessage(value) ?? `请求失败（${response.status}）`)
  }
  return value
}

async function readJson(response: Response): Promise<unknown> {
  try {
    const value: unknown = await response.json()
    return value
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined
    }
    throw error
  }
}
