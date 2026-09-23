import { ApiError } from "./configuration.errors"
import { parseTransportPeoplePlan, parseTransportPlan, parseTransportSuggestion } from "./transport.parsers"
import type {
  TransportAssignmentsPayload,
  TransportConfirmationPayload,
  TransportPeoplePlan,
  TransportPlan,
  TransportPlanPayload,
  TransportSuggestion,
  TransportSuggestionPayload,
} from "./transport.types"

export type {
  PersonRef,
  TransportAllocation,
  TransportAssignment,
  TransportContactSnapshot,
  TransportPeoplePlan,
  TransportPlan,
  TransportPlanPayload,
  TransportSuggestion,
  TransportVehicle,
} from "./transport.types"

const fallbackApiBaseUrl = "http://127.0.0.1:3000"
const apiBaseUrl = import.meta.env["VITE_API_BASE_URL"] ?? fallbackApiBaseUrl

export async function getTransportPlan(tourSessionId: string): Promise<TransportPlan> {
  return parseTransportPlan(await requestJson(`/transport/sessions/${encodeURIComponent(tourSessionId)}/plan`, { method: "GET" }))
}

export async function saveTransportPlan(tourSessionId: string, payload: TransportPlanPayload): Promise<TransportPlan> {
  return parseTransportPlan(await requestJson(`/transport/sessions/${encodeURIComponent(tourSessionId)}/plan`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }))
}

export async function getTransportPeoplePlan(tourSessionId: string): Promise<TransportPeoplePlan> {
  return parseTransportPeoplePlan(await requestJson(`/transport/sessions/${encodeURIComponent(tourSessionId)}/people-plan`, { method: "GET" }))
}

export async function saveTransportAssignments(tourSessionId: string, payload: TransportAssignmentsPayload): Promise<TransportPeoplePlan> {
  return parseTransportPeoplePlan(await requestJson(`/transport/sessions/${encodeURIComponent(tourSessionId)}/person-allocations`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }))
}

export async function confirmTransportPlan(tourSessionId: string, payload: TransportConfirmationPayload): Promise<TransportPeoplePlan> {
  return parseTransportPeoplePlan(await requestJson(`/transport/sessions/${encodeURIComponent(tourSessionId)}/confirmations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }))
}

export async function suggestTransportAssignments(tourSessionId: string, payload: TransportSuggestionPayload): Promise<TransportSuggestion> {
  return parseTransportSuggestion(await requestJson(`/transport/sessions/${encodeURIComponent(tourSessionId)}/suggestions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }))
}

export async function downloadTransportPlan(tourSessionId: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/transport/sessions/${encodeURIComponent(tourSessionId)}/export.xlsx`, {
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
  link.download = `车辆联系单-${tourSessionId}.xlsx`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
}

export function readableTransportError(error: unknown): string {
  return error instanceof ApiError ? error.message : "车辆安排操作失败，请稍后重试。"
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
  const record = Object.fromEntries(Object.entries(value))
  const message = record["message"]
  return typeof message === "string" ? message : undefined
}
