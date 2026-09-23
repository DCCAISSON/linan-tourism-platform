import { RosterApiError } from "./roster.errors"

export type RefundApplicationStatus = "submitted" | "approved" | "rejected" | "cancelled"

export type RefundApplication = {
  readonly id: string
  readonly orderId: string
  readonly status: RefundApplicationStatus
  readonly reason: string
  readonly amountFen: number
  readonly lines: readonly { readonly lineId: string; readonly displayName: string; readonly amountFen: number }[]
  readonly submittedAt: string
  readonly updatedAt: string
  readonly reviewReason: string | null
  readonly reviewedAt: string | null
  readonly refundRequestId: string | null
  readonly refundStatus: "pending" | "succeeded" | "failed" | null
}

const apiBaseUrl = import.meta.env["VITE_API_BASE_URL"] ?? "http://127.0.0.1:3000"

export async function listRefundApplications(status = ""): Promise<readonly RefundApplication[]> {
  const query = status.length === 0 ? "" : `?status=${encodeURIComponent(status)}`
  const value = await request(`/staff/refund-applications${query}`)
  if (!Array.isArray(value)) throw invalidResponse()
  return value.map(parseRefundApplication)
}

export async function reviewRefundApplication(id: string, decision: "approved" | "rejected", reason: string): Promise<RefundApplication> {
  return parseRefundApplication(await request(`/staff/refund-applications/${encodeURIComponent(id)}/review`, { decision, reason }))
}

export async function executeRefundApplication(id: string, outcome: "succeeded" | "failed", failureMessage: string | null): Promise<RefundApplication> {
  return parseRefundApplication(await request(`/staff/refund-applications/${encodeURIComponent(id)}/execute`, { outcome, failureMessage }))
}

async function request(path: string, body?: object): Promise<unknown> {
  const init: RequestInit = body === undefined
    ? { method: "GET", credentials: "include" }
    : { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) }
  const response = await fetch(`${apiBaseUrl}${path}`, init)
  let value: unknown
  try {
    value = await response.json()
  } catch (error) {
    if (error instanceof SyntaxError) throw new RosterApiError(response.status, "退款申请响应格式不正确")
    throw error
  }
  if (!response.ok) {
    const record = isRecord(value) ? value : {}
    const message = typeof record["message"] === "string" ? record["message"] : `请求失败（${response.status}）`
    throw new RosterApiError(response.status, message)
  }
  return value
}

export function parseRefundApplication(value: unknown): RefundApplication {
  const record = readRecord(value)
  const status = readApplicationStatus(record)
  const refundStatus = record["refundStatus"]
  const lines = record["lines"]
  if (!Array.isArray(lines) || (refundStatus !== null && refundStatus !== "pending" && refundStatus !== "succeeded" && refundStatus !== "failed")) {
    throw invalidResponse()
  }
  return {
    id: readText(record, "id"),
    orderId: readText(record, "orderId"),
    status,
    reason: readText(record, "reason"),
    amountFen: readCount(record, "amountFen"),
    lines: lines.map(parseLine),
    submittedAt: readText(record, "submittedAt"),
    updatedAt: readText(record, "updatedAt"),
    reviewReason: readNullableText(record, "reviewReason"),
    reviewedAt: readNullableText(record, "reviewedAt"),
    refundRequestId: readNullableText(record, "refundRequestId"),
    refundStatus,
  }
}

function parseLine(value: unknown): RefundApplication["lines"][number] {
  const record = readRecord(value)
  return { lineId: readText(record, "lineId"), displayName: readText(record, "displayName"), amountFen: readCount(record, "amountFen") }
}

function readApplicationStatus(record: Record<string, unknown>): RefundApplicationStatus {
  const status = readText(record, "status")
  if (status === "submitted" || status === "approved" || status === "rejected" || status === "cancelled") return status
  throw invalidResponse()
}

function readRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value
  throw invalidResponse()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
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

function readCount(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value
  throw invalidResponse()
}

function invalidResponse(): RosterApiError {
  return new RosterApiError(0, "退款申请响应格式不正确")
}
