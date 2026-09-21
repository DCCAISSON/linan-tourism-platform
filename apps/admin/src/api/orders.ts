import { RosterApiError } from "./roster.errors"

export type StaffOrder = {
  readonly id: string
  readonly code: string
  readonly payerName: string
  readonly status: "pending_payment" | "paid" | "cancelled" | "refunded"
  readonly amountFen: number
  readonly paidFen: number
  readonly participantCount: number
  readonly activityTitle: string
  readonly schoolName: string
  readonly startsAt: string
  readonly createdAt: string
}

export type StaffOrderDetail = StaffOrder & {
  readonly contactName: string
  readonly emergencyContactName: string | null
  readonly emergencyContactPhone: string | null
  readonly participants: readonly {
    readonly id: string
    readonly displayName: string
    readonly gradeName: string | null
    readonly className: string | null
    readonly amountFen: number
  }[]
}

export type StaffOrderList = { readonly orders: readonly StaffOrder[]; readonly total: number; readonly page: number; readonly pageSize: number }
export type RefundPreview = {
  readonly mode: "local_validation"
  readonly settlementPerformed: false
  readonly orderId: string
  readonly participantCount: number
  readonly amountFen: number
  readonly lines: readonly { readonly lineId: string; readonly displayName: string; readonly amountFen: number }[]
  readonly outcome?: "succeeded" | "failed"
}

const apiBaseUrl = import.meta.env["VITE_API_BASE_URL"] ?? "http://127.0.0.1:3000"
const devStaffId = import.meta.env["VITE_DEV_STAFF_ID"] ?? "dev-admin"
const headers = { "x-linan-dev-staff-id": devStaffId, "x-linan-dev-staff-role": "administrator" } as const

export async function listStaffOrders(keyword: string, status: string, page: number): Promise<StaffOrderList> {
  const params = new URLSearchParams({ keyword, status, page: String(page) })
  return parseList(await request(`/staff/orders?${params}`))
}

export async function getStaffOrder(id: string): Promise<StaffOrderDetail> {
  const record = readRecord(await request(`/staff/orders/${encodeURIComponent(id)}`))
  const participants = record["participants"]
  if (!Array.isArray(participants)) throw invalidResponse()
  return {
    ...parseOrder(record), contactName: readText(record, "contactName"),
    emergencyContactName: readNullableText(record, "emergencyContactName"),
    emergencyContactPhone: readNullableText(record, "emergencyContactPhone"),
    participants: participants.map((value) => {
      const line = readRecord(value)
      return { id: readText(line, "id"), displayName: readText(line, "displayName"),
        gradeName: readNullableText(line, "gradeName"), className: readNullableText(line, "className"), amountFen: readCount(line, "amountFen") }
    }),
  }
}

export async function refundPreview(id: string, lineIds: readonly string[]): Promise<RefundPreview> {
  return parseRefund(await request(`/staff/orders/${encodeURIComponent(id)}/refund-preview`, { lineIds }))
}

export async function simulateRefund(id: string, lineIds: readonly string[], outcome: "succeeded" | "failed"): Promise<RefundPreview> {
  const result = parseRefund(await request(`/staff/orders/${encodeURIComponent(id)}/refund-simulation`, { lineIds, outcome }))
  if (result.outcome !== outcome) throw invalidResponse()
  return result
}

async function request(path: string, body?: object): Promise<unknown> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? headers : { ...headers, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  let value: unknown
  try { value = await response.json() }
  catch (error) {
    if (error instanceof SyntaxError) throw new RosterApiError(response.status, "订单服务响应格式不正确")
    throw error
  }
  if (!response.ok) {
    const record = isRecord(value) ? value : {}
    const message = typeof record["message"] === "string" ? record["message"] : `请求失败（${response.status}）`
    throw new RosterApiError(response.status, message)
  }
  return value
}

function parseList(value: unknown): StaffOrderList {
  const record = readRecord(value)
  const orders = record["orders"]
  if (!Array.isArray(orders)) throw invalidResponse()
  return { orders: orders.map(parseOrder), total: readCount(record, "total"), page: readCount(record, "page"), pageSize: readCount(record, "pageSize") }
}

function parseOrder(value: unknown): StaffOrder {
  const record = readRecord(value)
  const status = readText(record, "status")
  if (status !== "pending_payment" && status !== "paid" && status !== "cancelled" && status !== "refunded") throw invalidResponse()
  return {
    id: readText(record, "id"), code: readText(record, "code"), payerName: readText(record, "payerName"), status,
    amountFen: readCount(record, "amountFen"), paidFen: readCount(record, "paidFen"), participantCount: readCount(record, "participantCount"),
    activityTitle: readText(record, "activityTitle"), schoolName: readText(record, "schoolName"),
    startsAt: readText(record, "startsAt"), createdAt: readText(record, "createdAt"),
  }
}

function parseRefund(value: unknown): RefundPreview {
  const record = readRecord(value)
  const lines = record["lines"]
  if (record["mode"] !== "local_validation" || record["settlementPerformed"] !== false || !Array.isArray(lines)) throw invalidResponse()
  const outcome = record["outcome"]
  if (outcome !== undefined && outcome !== "succeeded" && outcome !== "failed") throw invalidResponse()
  return {
    mode: "local_validation", settlementPerformed: false, orderId: readText(record, "orderId"),
    participantCount: readCount(record, "participantCount"), amountFen: readCount(record, "amountFen"),
    lines: lines.map((value) => { const line = readRecord(value); return { lineId: readText(line, "lineId"), displayName: readText(line, "displayName"), amountFen: readCount(line, "amountFen") } }),
    ...(outcome === undefined ? {} : { outcome }),
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
function invalidResponse(): RosterApiError { return new RosterApiError(0, "订单响应格式不正确") }
