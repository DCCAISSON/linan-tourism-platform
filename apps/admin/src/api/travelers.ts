import { RosterApiError, readableRosterError } from "./roster.errors"
import { parseTravelerList } from "./travelers.parsers"
import type { TravelerImportChange, TravelerList, TravelerQuery } from "./travelers.types"

export { RosterApiError, readableRosterError }
export type { TravelerImportChange, TravelerList, TravelerQuery, TravelerRow, TravelerSource } from "./travelers.types"

const fallbackApiBaseUrl = "http://127.0.0.1:3000"
const apiBaseUrl = import.meta.env["VITE_API_BASE_URL"] ?? fallbackApiBaseUrl

export async function getTravelers(tourSessionId: string, query: TravelerQuery = {}): Promise<TravelerList> {
  const value = await requestJson(`/travelers/sessions/${encodeURIComponent(tourSessionId)}?${buildQueryString(query)}`)
  return parseTravelerList(value)
}

export async function confirmTravelerEligibility(importPersonId: string, payload: TravelerImportChange): Promise<TravelerList> {
  return mutateImport(`/travelers/imports/${encodeURIComponent(importPersonId)}/confirm`, payload)
}

export async function disableImportedTraveler(importPersonId: string, payload: TravelerImportChange): Promise<TravelerList> {
  return mutateImport(`/travelers/imports/${encodeURIComponent(importPersonId)}/disable`, payload)
}

export async function downloadTravelersExport(tourSessionId: string, query: TravelerQuery = {}): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/travelers/sessions/${encodeURIComponent(tourSessionId)}/export.xlsx?${buildQueryString(query)}`, {
    method: "GET",
    credentials: "include",
  })
  if (!response.ok) {
    const value = await readJson(response)
    throw new RosterApiError(response.status, readErrorMessage(value) ?? `导出失败（${response.status}）`)
  }
  const objectUrl = URL.createObjectURL(await response.blob())
  const link = document.createElement("a")
  link.href = objectUrl
  link.download = `出行名单-${tourSessionId}.xlsx`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
}

async function mutateImport(path: string, payload: TravelerImportChange): Promise<TravelerList> {
  const value = await requestJson(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  return parseTravelerList(value)
}

async function requestJson(path: string, init: RequestInit = { method: "GET", credentials: "include" }): Promise<unknown> {
  const response = await fetch(`${apiBaseUrl}${path}`, init)
  const value = await readJson(response)
  if (!response.ok) {
    throw new RosterApiError(response.status, readErrorMessage(value) ?? `请求失败（${response.status}）`)
  }
  return value
}

function buildQueryString(query: TravelerQuery): string {
  const params = new URLSearchParams()
  appendOptionalParam(params, "classId", query.classId)
  appendOptionalParam(params, "source", query.source)
  appendOptionalParam(params, "search", query.search)
  if (query.includeInactive === true) params.set("includeInactive", "true")
  if (query.page !== undefined) params.set("page", String(query.page))
  if (query.pageSize !== undefined) params.set("pageSize", String(query.pageSize))
  return params.toString()
}

function appendOptionalParam(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value !== undefined && value.length > 0) params.set(key, value)
}

async function readJson(response: Response): Promise<unknown> {
  try {
    const value: unknown = await response.json()
    return value
  } catch (error) {
    if (error instanceof SyntaxError) return undefined
    throw error
  }
}

function readErrorMessage(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined
  const message = value["message" as keyof typeof value]
  return typeof message === "string" ? message : undefined
}
