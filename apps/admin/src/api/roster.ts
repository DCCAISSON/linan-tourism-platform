import { resolveAdminApiBaseUrl } from "./base-url"
import { RosterApiError, readableRosterError } from "./roster.errors"
import { parseRosterImportResult, parseRosterSummary } from "./roster.parsers"
import type { RosterImportPayload, RosterImportResult, RosterImportTemplate, RosterQuery, RosterSummary } from "./roster.types"

export { RosterApiError, readableRosterError }
export type { RosterFilters, RosterImportPayload, RosterImportResult, RosterImportTemplate, RosterQuery, RosterRow, RosterSummary } from "./roster.types"

const apiBaseUrl = resolveAdminApiBaseUrl()

export async function downloadRosterTemplate(template: RosterImportTemplate): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/roster/templates/${template}.xlsx`, {
    method: "GET",
    credentials: "include",
  })
  if (!response.ok) {
    const value = await readJson(response)
    throw new RosterApiError(response.status, readErrorMessage(value) ?? `下载失败（${response.status}）`)
  }
  const names = { parent_child: "1-2年级亲子模板", grade_3_6: "3-6年级学生模板", teacher: "教师名单模板" } as const
  const objectUrl = URL.createObjectURL(await response.blob())
  const link = document.createElement("a")
  link.href = objectUrl
  link.download = `${names[template]}.xlsx`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
}

export async function getRosterSummary(query: RosterQuery): Promise<RosterSummary> {
  const value = await requestJson(`/roster/summary?${buildQueryString(query)}`)
  return parseRosterSummary(value)
}

export async function importRoster(payload: RosterImportPayload): Promise<RosterImportResult> {
  const form = new FormData()
  form.set("template", payload.template)
  form.set("tourSessionId", payload.tourSessionId)
  form.set("schoolId", payload.schoolId ?? "")
  form.set("gradeId", payload.gradeId ?? "")
  form.set("classId", payload.classId ?? "")
  form.set("file", payload.file)
  const response = await fetch(`${apiBaseUrl}/roster/imports`, {
    method: "POST",
    credentials: "include",
    body: form,
  })
  const value = await readJson(response)
  if (!response.ok) {
    throw new RosterApiError(response.status, readErrorMessage(value) ?? `导入失败（${response.status}）`)
  }
  return parseRosterImportResult(value)
}

export async function downloadRosterImportErrors(batchId: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/roster/imports/${encodeURIComponent(batchId)}/errors.csv`, {
    method: "GET",
    credentials: "include",
  })
  if (!response.ok) {
    const value = await readJson(response)
    throw new RosterApiError(response.status, readErrorMessage(value) ?? `下载失败（${response.status}）`)
  }
  const objectUrl = URL.createObjectURL(await response.blob())
  const link = document.createElement("a")
  link.href = objectUrl
  link.download = `名单导入错误-${batchId}.csv`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
}

export async function downloadRosterExport(query: RosterQuery): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/roster/export.xlsx?${buildQueryString(query)}`, {
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
  link.download = `名单统计-${query.tourSessionId}.xlsx`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
}

async function requestJson(path: string): Promise<unknown> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "GET",
    credentials: "include",
  })
  const value = await readJson(response)

  if (!response.ok) {
    throw new RosterApiError(response.status, readErrorMessage(value) ?? `请求失败（${response.status}）`)
  }

  return value
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
