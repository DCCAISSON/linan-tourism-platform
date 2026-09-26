import { resolveAdminApiBaseUrl } from "./base-url"
import { RosterApiError } from "./roster.errors"

const apiBaseUrl = resolveAdminApiBaseUrl()

export type EvaluationStandardSummary = {
  readonly id: string
  readonly tourSessionId: string
  readonly title: string
  readonly confirmedAt: string | null
  readonly version: number
}
export type EvaluationRow = {
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
  readonly standards: readonly EvaluationStandardSummary[]
  readonly evaluations: readonly EvaluationRow[]
}
export type SchoolReportResult = {
  readonly filename: string
  readonly contentType: string
  readonly formatLabel: string
}

export type StandardDraftInput = {
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

export async function confirmEvaluationStandard(id: string, expectedVersion: number): Promise<EvaluationStandardSummary> {
  return parseStandard(await request(`/evaluations/staff/standards/${encodeURIComponent(id)}/confirm`, { expectedVersion, confirmed: true }))
}

export async function confirmEvaluationSession(sessionId: string): Promise<readonly EvaluationRow[]> {
  const value = await request(`/evaluations/staff/sessions/${encodeURIComponent(sessionId)}/confirm`, {})
  if (!Array.isArray(value)) throw invalidResponse()
  return value.map(parseEvaluationRow)
}

export function parseEvaluationDashboard(value: unknown): EvaluationDashboard {
  const record = readRecord(value)
  const standards = record["standards"]
  const evaluations = record["evaluations"]
  if (!Array.isArray(standards) || !Array.isArray(evaluations)) throw invalidResponse()
  return { standards: standards.map(parseStandard), evaluations: evaluations.map(parseEvaluationRow) }
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
  return {
    id: readText(record, "id"),
    tourSessionId: readText(record, "tourSessionId"),
    title: readText(record, "title"),
    confirmedAt: readNullableText(record, "confirmedAt"),
    version: readCount(record, "version"),
  }
}

function parseEvaluationRow(value: unknown): EvaluationRow {
  const record = readRecord(value)
  return {
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
