import { resolveAdminApiBaseUrl } from "./base-url"
import { ApiError } from "./configuration.errors"
import { parsePretripAdjustment, parsePretripConfig, parseSchoolConfirmation, parseSchoolConfirmations } from "./pretrip.parsers"
import type { PretripAdjustment, PretripAdjustmentPayload, PretripAdjustmentProcessPayload, PretripConfig, PretripConfigPayload, SchoolPretripConfirmation } from "./pretrip.types"

export type { PretripAdjustment, PretripAdjustmentPayload, PretripAttachment, PretripConfig, PretripConfigPayload, PretripTravelMode, SchoolPretripConfirmation } from "./pretrip.types"

const apiBaseUrl = resolveAdminApiBaseUrl()

export async function getPretripConfig(tourSessionId: string): Promise<PretripConfig> {
  return parsePretripConfig(await requestJson(`/pretrip/staff/sessions/${encodeURIComponent(tourSessionId)}`, { method: "GET" }))
}

export async function savePretripConfig(tourSessionId: string, payload: PretripConfigPayload): Promise<PretripConfig> {
  return parsePretripConfig(await requestJson(`/pretrip/staff/sessions/${encodeURIComponent(tourSessionId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }))
}

export async function listSchoolConfirmations(tourSessionId: string): Promise<readonly SchoolPretripConfirmation[]> {
  return parseSchoolConfirmations(await requestJson(`/pretrip/staff/sessions/${encodeURIComponent(tourSessionId)}/school-confirmations`, { method: "GET" }))
}

export async function signSchoolPretrip(tourSessionId: string): Promise<SchoolPretripConfirmation> {
  return parseSchoolConfirmation(await requestJson(`/pretrip/school/sessions/${encodeURIComponent(tourSessionId)}/confirmations`, { method: "POST" }))
}

export async function submitPretripAdjustment(tourSessionId: string, payload: PretripAdjustmentPayload): Promise<PretripAdjustment> {
  return parsePretripAdjustment(await requestJson(`/pretrip/school/sessions/${encodeURIComponent(tourSessionId)}/adjustments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }))
}

export async function processPretripAdjustment(requestId: string, payload: PretripAdjustmentProcessPayload): Promise<PretripAdjustment> {
  return parsePretripAdjustment(await requestJson(`/pretrip/staff/adjustments/${encodeURIComponent(requestId)}/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }))
}

export function readablePretripError(error: unknown): string {
  return error instanceof ApiError ? error.message : "Pretrip request failed"
}

async function requestJson(path: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, credentials: "include" })
  const value = await readJson(response)
  if (!response.ok) throw new ApiError(response.status, readErrorMessage(value) ?? `request failed (${response.status})`)
  return value
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
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
