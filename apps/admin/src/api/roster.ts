import { RosterApiError, readableRosterError } from "./roster.errors"
import { parseRosterSummary } from "./roster.parsers"
import type { RosterQuery, RosterSummary } from "./roster.types"

export { RosterApiError, readableRosterError }
export type { RosterFilters, RosterQuery, RosterRow, RosterSummary } from "./roster.types"

const fallbackApiBaseUrl = "http://127.0.0.1:3000"
const apiBaseUrl = import.meta.env["VITE_API_BASE_URL"] ?? fallbackApiBaseUrl
const devStaffId = import.meta.env["VITE_DEV_STAFF_ID"] ?? "dev-admin"
const devStaffSchoolId = import.meta.env["VITE_DEV_STAFF_SCHOOL_ID"]

export async function getRosterSummary(query: RosterQuery): Promise<RosterSummary> {
  const value = await requestJson(`/roster/summary?${buildQueryString(query)}`)
  return parseRosterSummary(value)
}

export async function downloadRosterExport(query: RosterQuery): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/roster/export.xlsx?${buildQueryString(query)}`, {
    method: "GET",
    headers: buildStaffHeaders(),
  })

  if (!response.ok) {
    const value = await readJson(response)
    throw new RosterApiError(response.status, readErrorMessage(value) ?? `导出失败（${response.status}）`)
  }

  const objectUrl = URL.createObjectURL(await response.blob())
  const link = document.createElement("a")
  link.href = objectUrl
  link.download = `名单统计-${query.tourSessionId}.xlsx`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
}

async function requestJson(path: string): Promise<unknown> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "GET",
    headers: buildStaffHeaders(),
  })
  const value = await readJson(response)

  if (!response.ok) {
    throw new RosterApiError(response.status, readErrorMessage(value) ?? `请求失败（${response.status}）`)
  }

  return value
}

function buildStaffHeaders(): Headers {
  const headers = new Headers()
  headers.set("x-linan-dev-staff-id", devStaffId)
  headers.set("x-linan-dev-staff-role", "administrator")

  if (devStaffSchoolId !== undefined && devStaffSchoolId.length > 0) {
    headers.set("x-linan-dev-staff-school-id", devStaffSchoolId)
  }

  return headers
}

function buildQueryString(query: RosterQuery): string {
  const params = new URLSearchParams()
  params.set("tourSessionId", query.tourSessionId)
  appendOptionalParam(params, "schoolId", query.schoolId)
  appendOptionalParam(params, "gradeId", query.gradeId)
  appendOptionalParam(params, "classId", query.classId)
  return params.toString()
}

function appendOptionalParam(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value !== undefined && value.length > 0) {
    params.set(key, value)
  }
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

function readErrorMessage(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const message = value["message"]
  return typeof message === "string" ? message : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
