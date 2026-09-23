import { RosterApiError } from "./roster.errors"

const apiBaseUrl = import.meta.env["VITE_API_BASE_URL"] ?? "http://127.0.0.1:3000"

export type FeedbackSummary = {
  readonly totalCount: number
  readonly publicCount: number
  readonly averageRating: number
}
export type FeedbackItem = {
  readonly id: string
  readonly source: "family" | "school"
  readonly rating: number
  readonly content: string
  readonly allowPublic: boolean
  readonly status: "submitted" | "published" | "rejected"
  readonly publicExcerpt: string
  readonly version: number
}
export type FeedbackDashboard = {
  readonly summary: FeedbackSummary
  readonly items: readonly FeedbackItem[]
}

export async function loadFeedbackDashboard(sessionId: string): Promise<FeedbackDashboard> {
  return parseFeedbackDashboard(await request(`/feedback/staff/sessions/${encodeURIComponent(sessionId)}`))
}

export async function reviewFeedback(id: string, expectedVersion: number, status: "published" | "rejected", publicExcerpt: string): Promise<FeedbackItem> {
  return parseFeedbackItem(await request(`/feedback/staff/${encodeURIComponent(id)}/review`, { expectedVersion, status, publicExcerpt }))
}

export function parseFeedbackDashboard(value: unknown): FeedbackDashboard {
  const record = readRecord(value)
  const items = record["items"]
  if (!Array.isArray(items)) throw invalidResponse()
  return { summary: parseSummary(record["summary"]), items: items.map(parseFeedbackItem) }
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

function parseSummary(value: unknown): FeedbackSummary {
  const record = readRecord(value)
  return { totalCount: readCount(record, "totalCount"), publicCount: readCount(record, "publicCount"), averageRating: readRating(record, "averageRating") }
}

function parseFeedbackItem(value: unknown): FeedbackItem {
  const record = readRecord(value)
  const source = readText(record, "source")
  const status = readText(record, "status")
  if ((source !== "family" && source !== "school") || (status !== "submitted" && status !== "published" && status !== "rejected")) throw invalidResponse()
  return {
    id: readText(record, "id"),
    source,
    rating: readRating(record, "rating"),
    content: readText(record, "content"),
    allowPublic: readBoolean(record, "allowPublic"),
    status,
    publicExcerpt: readText(record, "publicExcerpt"),
    version: readCount(record, "version"),
  }
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

function readRating(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 5) return value
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
  return new RosterApiError(0, "反馈响应格式不正确")
}
