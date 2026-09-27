import { resolveAdminApiBaseUrl } from "./base-url"
import { RosterApiError } from "./roster.errors"

const apiBaseUrl = resolveAdminApiBaseUrl()
export type EvaluationDimension = { readonly code: string; readonly label: string; readonly description: string }
export type DimensionObservation = { readonly code: string; readonly observation: string }

export type EvaluationStandardSummary = {
  readonly dimensions: readonly EvaluationDimension[]
  readonly id: string
  readonly tourSessionId: string
  readonly title: string
  readonly confirmedAt: string | null
  readonly version: number
  readonly items: readonly { readonly code: "A" | "B"; readonly label: string; readonly description: string }[]
}
export type EvaluationRow = {
  readonly dimensionObservations: readonly DimensionObservation[]
  readonly id: string
  readonly version: number
  readonly standardId: string | null
  readonly personRef: string
  readonly displayName: string
  readonly organizationId: string
  readonly gradeName: string | null
  readonly className: string | null
  readonly gradeCode: "A" | "B" | null
  readonly gradeLabel: string | null
  readonly internalComment: string
  readonly excellent: boolean
  readonly attention: boolean
  readonly confirmedAt: string | null
}
export type EvaluationDashboard = {
  readonly organizationId: string
  readonly students: readonly { readonly personRef: string; readonly displayName: string; readonly gradeName: string | null; readonly className: string | null }[]
  readonly standards: readonly EvaluationStandardSummary[]
  readonly evaluations: readonly EvaluationRow[]
}
export type SchoolReportResult = {
  readonly filename: string
  readonly contentType: string
  readonly formatLabel: string
}

export type StandardDraftInput = {
  readonly dimensions?: readonly EvaluationDimension[]
  readonly tourSessionId: string
  readonly title: string
  readonly items: readonly { readonly code: "A" | "B"; readonly label: string; readonly description: string }[]
  readonly publicFormatNote: string
}

export async function loadEvaluationDashboard(sessionId: string): Promise<EvaluationDashboard> {
  return parseEvaluationDashboard(await request(`/evaluations/staff/sessions/${encodeURIComponent(sessionId)}`))
}

export async function createEvaluationStandard(input: StandardDraftInput): Promise<EvaluationStandardSummary> {
  return parseStandard(await request("/evaluations/staff/standards", input))
}

export async function loadEvaluationStandards(sessionId: string): Promise<readonly EvaluationStandardSummary[]> {
  const value = await request(`/evaluations/staff/sessions/${encodeURIComponent(sessionId)}/standards`)
  if (!Array.isArray(value)) throw invalidResponse()
  return value.map(parseStandard)
}

export async function confirmEvaluationStandard(id: string, expectedVersion: number): Promise<EvaluationStandardSummary> {
  return parseStandard(await request(`/evaluations/staff/standards/${encodeURIComponent(id)}/confirm`, { expectedVersion, confirmed: true }))
}

export async function confirmEvaluationSession(sessionId: string): Promise<readonly EvaluationRow[]> {
  const value = await request(`/evaluations/staff/sessions/${encodeURIComponent(sessionId)}/confirm`, {})
  if (!Array.isArray(value)) throw invalidResponse()
  return value.map(parseEvaluationRow)
}

export type EvaluationObservation = Pick<EvaluationRow, "personRef" | "internalComment" | "excellent" | "attention" | "gradeCode"> & { readonly dimensionObservations?: readonly DimensionObservation[] }
export type SchoolEvaluationRow = Pick<EvaluationRow, "personRef" | "displayName" | "gradeName" | "className"> & { readonly gradeCode: "A" | "B"; readonly gradeLabel: string }

export async function loadSchoolEvaluations(sessionId: string, organizationId: string): Promise<readonly SchoolEvaluationRow[]> {
  const value = await request(`/evaluations/school/sessions/${encodeURIComponent(sessionId)}?organizationId=${encodeURIComponent(organizationId)}`)
  if (!Array.isArray(value)) throw invalidResponse()
  return value.map((value) => {
    const row = readRecord(value)
    const gradeCode = readGrade(row["gradeCode"])
    if (gradeCode === null) throw invalidResponse()
    return { personRef: readText(row, "personRef"), displayName: readText(row, "displayName"), gradeName: readNullableText(row, "gradeName"), className: readNullableText(row, "className"), gradeCode, gradeLabel: readText(row, "gradeLabel") }
  })
}

export async function batchEvaluate(input: { readonly tourSessionId: string; readonly standardId: string | null; readonly observations: readonly EvaluationObservation[]; readonly idempotencyKey: string }): Promise<void> {
  await request("/evaluations/staff/batch", input)
}

export async function reviseEvaluation(row: EvaluationRow, input: Omit<EvaluationObservation, "personRef"> & { readonly standardId?: string }): Promise<void> {
  await request(`/evaluations/staff/${encodeURIComponent(row.id)}`, { ...input, expectedVersion: row.version })
}

export async function downloadEvaluationReport(sessionId: string, organizationId: string, format: "xlsx" | "wordxml"): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/evaluations/school/sessions/${encodeURIComponent(sessionId)}/report?organizationId=${encodeURIComponent(organizationId)}&format=${format}`, { credentials: "include" })
  if (!response.ok) throw new RosterApiError(response.status, readErrorMessage(await readJson(response)) ?? "报告导出失败")
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement("a")
  link.href = url
  link.download = `学校评价报告.${format === "xlsx" ? "xlsx" : "xml"}`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function parseEvaluationDashboard(value: unknown): EvaluationDashboard {
  const record = readRecord(value)
  const standards = record["standards"]
  const evaluations = record["evaluations"]
  if (!Array.isArray(standards) || !Array.isArray(evaluations)) throw invalidResponse()
  const students = record["students"]
  if (!Array.isArray(students)) throw invalidResponse()
  return { organizationId: readText(record, "organizationId"), students: students.map((value) => {
    const student = readRecord(value)
    return { personRef: readText(student, "personRef"), displayName: readText(student, "displayName"), gradeName: readNullableText(student, "gradeName"), className: readNullableText(student, "className") }
  }), standards: standards.map(parseStandard), evaluations: evaluations.map(parseEvaluationRow) }
}

export function parseSchoolReportResult(value: unknown): SchoolReportResult {
  const record = readRecord(value)
  return { filename: readText(record, "filename"), contentType: readText(record, "contentType"), formatLabel: readText(record, "formatLabel") }
}

async function request(path: string, body?: object): Promise<unknown> {
  const init: RequestInit = body === undefined ? { method: "GET", credentials: "include" } : { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) }
  const response = await fetch(`${apiBaseUrl}${path}`, init)
  const value = await readJson(response)
  if (!response.ok) throw new RosterApiError(response.status, readErrorMessage(value) ?? `请求失败（${response.status}）`)
  return value
}

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json() }
  catch (error) {
    if (error instanceof SyntaxError) return undefined
    throw error
  }
}

function parseStandard(value: unknown): EvaluationStandardSummary {
  const record = readRecord(value)
  const items = record["items"]
  const dimensions = record["dimensions"] ?? []
  if (!Array.isArray(items) || !Array.isArray(dimensions)) throw invalidResponse()
  return {
    dimensions: dimensions.map((value) => {
      const dimension = readRecord(value)
      return { code: readText(dimension, "code"), label: readText(dimension, "label"), description: readText(dimension, "description") }
    }),
    id: readText(record, "id"),
    tourSessionId: readText(record, "tourSessionId"),
    title: readText(record, "title"),
    confirmedAt: readNullableText(record, "confirmedAt"),
    version: readCount(record, "version"),
    items: items.map((value) => {
      const item = readRecord(value)
      const code = readGrade(item["code"])
      if (code === null) throw invalidResponse()
      return { code, label: readText(item, "label"), description: readText(item, "description") }
    }),
  }
}

function parseEvaluationRow(value: unknown): EvaluationRow {
  const record = readRecord(value)
  const dimensionObservations = record["dimensionObservations"] ?? []
  if (!Array.isArray(dimensionObservations)) throw invalidResponse()
  return {
    dimensionObservations: dimensionObservations.map((value) => {
      const observation = readRecord(value)
      return { code: readText(observation, "code"), observation: readText(observation, "observation") }
    }),
    id: readText(record, "id"),
    version: readCount(record, "version"),
    standardId: readNullableText(record, "standardId"),
    personRef: readText(record, "personRef"),
    displayName: readText(record, "displayName"),
    organizationId: readText(record, "organizationId"),
    gradeName: readNullableText(record, "gradeName"),
    className: readNullableText(record, "className"),
    gradeCode: readGrade(record["gradeCode"]),
    gradeLabel: readNullableText(record, "gradeLabel"),
    internalComment: readText(record, "internalComment"),
    excellent: readBoolean(record, "excellent"),
    attention: readBoolean(record, "attention"),
    confirmedAt: readNullableText(record, "confirmedAt"),
  }
}

function readGrade(value: unknown): "A" | "B" | null {
  if (value === null || value === "A" || value === "B") return value
  throw invalidResponse()
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return Object.fromEntries(Object.entries(value))
  throw invalidResponse()
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

function readBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key]
  if (typeof value === "boolean") return value
  throw invalidResponse()
}

function readCount(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value
  throw invalidResponse()
}

function readErrorMessage(value: unknown): string | undefined {
  const record = isRecord(value) ? value : {}
  return typeof record["message"] === "string" ? record["message"] : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function invalidResponse(): RosterApiError {
  return new RosterApiError(0, "评价响应格式不正确")
}
