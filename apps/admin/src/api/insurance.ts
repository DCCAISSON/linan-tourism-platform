import { resolveAdminApiBaseUrl } from "./base-url"
import { ApiError } from "./configuration.errors"
import { parseInsuranceBatch, parseInsuranceDiff, parseInsurancePreview } from "./insurance.parsers"
import type { InsuranceBatch, InsuranceDiff, InsuranceExportKind, InsurancePreview } from "./insurance.types"

export type { InsuranceBatch, InsuranceBatchPerson, InsuranceBatchStatus, InsuranceDiff, InsuranceExportKind, InsuranceHandoff, InsurancePreview } from "./insurance.types"

const apiBaseUrl = resolveAdminApiBaseUrl()

export async function getLatestInsuranceBatch(tourSessionId: string): Promise<InsuranceBatch | null> {
  const value = await requestJson(`/insurance/sessions/${encodeURIComponent(tourSessionId)}/latest`, { method: "GET" })
  return value === null ? null : parseInsuranceBatch(value)
}

export async function getInsurancePreview(tourSessionId: string): Promise<InsurancePreview> {
  return parseInsurancePreview(await requestJson(`/insurance/sessions/${encodeURIComponent(tourSessionId)}/preview`, { method: "GET" }))
}

export async function createInsuranceBatch(payload: { readonly tourSessionId: string; readonly expectedRosterVersion: string; readonly companyTemplateName: string | null }): Promise<InsuranceBatch> {
  return parseInsuranceBatch(await requestJson("/insurance/batches", jsonRequest("POST", payload)))
}

export async function getInsuranceDiff(batchId: string): Promise<InsuranceDiff> {
  return parseInsuranceDiff(await requestJson(`/insurance/batches/${encodeURIComponent(batchId)}/diff`, { method: "GET" }))
}

export async function submitInsuranceBatch(batchId: string, payload: { readonly expectedRosterVersion: string; readonly receiptReference: string; readonly note: string }): Promise<InsuranceBatch> {
  return parseInsuranceBatch(await requestJson(`/insurance/batches/${encodeURIComponent(batchId)}/submit`, jsonRequest("POST", payload)))
}

export async function recordInsuranceResult(batchId: string, payload: { readonly success: boolean; readonly receiptReference: string | null; readonly policyNumber: string | null; readonly coverageStart: string | null; readonly coverageEnd: string | null; readonly note: string }): Promise<InsuranceBatch> {
  return parseInsuranceBatch(await requestJson(`/insurance/batches/${encodeURIComponent(batchId)}/manual-result`, jsonRequest("POST", payload)))
}

export async function createInsuranceChangeHandoff(batchId: string, payload: { readonly kind: "policy_change" | "cancellation_change"; readonly note: string; readonly receiptReference: string | null }): Promise<InsuranceBatch> {
  return parseInsuranceBatch(await requestJson(`/insurance/batches/${encodeURIComponent(batchId)}/change-handoffs`, jsonRequest("POST", payload)))
}

export async function downloadInsuranceExport(batchId: string, kind: InsuranceExportKind, sensitive: boolean): Promise<void> {
  const params = new URLSearchParams({ kind, sensitive: sensitive ? "true" : "false" })
  const response = await fetch(`${apiBaseUrl}/insurance/batches/${encodeURIComponent(batchId)}/export.xlsx?${params.toString()}`, {
    method: "GET",
    credentials: "include",
  })
  if (!response.ok) {
    const value = await readJson(response)
    throw new ApiError(response.status, readErrorMessage(value) ?? `导出失败（${response.status}）`)
  }
  const objectUrl = URL.createObjectURL(await response.blob())
  const link = document.createElement("a")
  link.href = objectUrl
  link.download = `保险名单-${batchId}.xlsx`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
}

export function readableInsuranceError(error: unknown): string {
  return error instanceof ApiError ? error.message : "保险操作失败，请稍后重试。"
}

function jsonRequest(method: "POST", payload: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
}

async function requestJson(path: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, credentials: "include" })
  const value = await readJson(response)
  if (!response.ok) throw new ApiError(response.status, readErrorMessage(value) ?? `请求失败（${response.status}）`)
  return value
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
  const message = Object.fromEntries(Object.entries(value))["message"]
  return typeof message === "string" ? message : undefined
}
