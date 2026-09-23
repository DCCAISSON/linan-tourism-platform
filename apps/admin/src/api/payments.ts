import { RosterApiError } from "./roster.errors"

const apiBaseUrl = import.meta.env["VITE_API_BASE_URL"] ?? "http://127.0.0.1:3000"

export type BillDifference = {
  readonly kind: "wechat_only" | "local_only" | "amount_mismatch" | "matched"
  readonly outTradeNo: string
  readonly wechatAmountFen: number | null
  readonly localAmountFen: number | null
  readonly summary: string
}

export type PaymentReconciliation = {
  readonly billDate: string
  readonly contentHash: string
  readonly differenceCount: number
  readonly confirmedNote: string | null
  readonly differences: readonly BillDifference[]
}

export async function reconcileWechatBill(date: string): Promise<PaymentReconciliation> {
  return parseReconciliation(await request("/staff/payments/reconciliation", { date }))
}

export async function getWechatReconciliation(date: string): Promise<PaymentReconciliation> {
  return parseReconciliation(await request(`/staff/payments/reconciliation/${encodeURIComponent(date)}`))
}

export async function confirmWechatReconciliation(date: string, note: string): Promise<PaymentReconciliation> {
  return parseReconciliation(await request(`/staff/payments/reconciliation/${encodeURIComponent(date)}/confirm`, { note }))
}

async function request(path: string, body?: object): Promise<unknown> {
  const init: RequestInit = body === undefined
    ? { method: "GET", credentials: "include" }
    : { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) }
  const response = await fetch(`${apiBaseUrl}${path}`, init)
  let value: unknown
  try { value = await response.json() }
  catch (error) {
    if (error instanceof SyntaxError) throw new RosterApiError(response.status, "微信支付对账响应格式不正确")
    throw error
  }
  if (!response.ok) {
    const message = isRecord(value) && typeof value["message"] === "string" ? value["message"] : `微信支付对账请求失败：${response.status}`
    throw new RosterApiError(response.status, message)
  }
  return value
}

function parseReconciliation(value: unknown): PaymentReconciliation {
  const record = readRecord(value)
  const differences = record["differences"]
  if (!Array.isArray(differences)) throw invalidResponse()
  return {
    billDate: readText(record, "billDate"),
    contentHash: readText(record, "contentHash"),
    differenceCount: readCount(record, "differenceCount"),
    confirmedNote: readNullableText(record, "confirmedNote"),
    differences: differences.map(parseDifference),
  }
}

function parseDifference(value: unknown): BillDifference {
  const record = readRecord(value)
  const kind = record["kind"]
  if (kind !== "wechat_only" && kind !== "local_only" && kind !== "amount_mismatch" && kind !== "matched") throw invalidResponse()
  return {
    kind,
    outTradeNo: readText(record, "outTradeNo"),
    wechatAmountFen: readNullableCount(record, "wechatAmountFen"),
    localAmountFen: readNullableCount(record, "localAmountFen"),
    summary: readText(record, "summary"),
  }
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
function readNullableCount(record: Record<string, unknown>, key: string): number | null {
  const value = record[key]
  if (value === null) return null
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value
  throw invalidResponse()
}
function invalidResponse(): RosterApiError { return new RosterApiError(0, "微信支付对账响应格式不正确") }
