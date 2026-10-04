import { resolveAdminApiBaseUrl } from "./base-url"
import { RosterApiError } from "./roster.errors"

export type OrderChangeStatus = "submitted" | "needs_information" | "approved" | "rejected" | "withdrawn"
export type OrderChangeDecision = "needs_information" | "approved" | "rejected"
export const orderChangeStatusLabels = { submitted: "待审核", needs_information: "待补充材料", approved: "审核通过·待实际处理", rejected: "已驳回", withdrawn: "已撤回" } as const

export type OrderChangeRequest = {
  readonly id: string
  readonly orderId: string
  readonly orderCode: string
  readonly kind: "replacement" | "addition"
  readonly originalLineId: string | null
  readonly reason: string
  readonly status: OrderChangeStatus
  readonly version: number
  readonly proposedParticipant: {
    readonly displayName: string
    readonly participantKind: "student" | "adult"
    readonly schoolName: string
    readonly gradeName: string | null
    readonly className: string | null
    readonly identityNumberMasked: string
    readonly phoneMasked: string
  }
  readonly originalSnapshot: {
    readonly amountFen: number
    readonly paidFen: number
    readonly lines: readonly { readonly id: string; readonly displayName: string; readonly amountFen: number }[]
  }
  readonly history: readonly { readonly version: number; readonly status: OrderChangeStatus; readonly action: string; readonly note: string; readonly actorName: string; readonly at: string }[]
  readonly refundConflict: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

const baseUrl = resolveAdminApiBaseUrl()

export async function listOrderChanges(): Promise<readonly OrderChangeRequest[]> {
  const value = await request("/staff/order-changes")
  if (!Array.isArray(value)) throw invalidResponse()
  return value.map(parseOrderChange)
}

export async function reviewOrderChange(id: string, expectedVersion: number, decision: OrderChangeDecision, note: string): Promise<OrderChangeRequest> {
  return parseOrderChange(await request(`/staff/order-changes/${encodeURIComponent(id)}/review`, { expectedVersion, decision, note }))
}

export async function addOrderChangeNote(id: string, expectedVersion: number, note: string): Promise<OrderChangeRequest> {
  return parseOrderChange(await request(`/staff/order-changes/${encodeURIComponent(id)}/notes`, { expectedVersion, note }))
}

async function request(path: string, body?: object): Promise<unknown> {
  const init: RequestInit = body === undefined ? { method: "GET", credentials: "include" } : { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  const response = await fetch(`${baseUrl}${path}`, init)
  let value: unknown
  try { value = await response.json() }
  catch (cause) { if (cause instanceof SyntaxError) throw invalidResponse(); throw cause }
  if (!response.ok) {
    const row = isRecord(value) ? value : {}
    throw new RosterApiError(response.status, typeof row["message"] === "string" ? row["message"] : "人员变更申请处理失败，请重试")
  }
  return value
}

export function parseOrderChange(value: unknown): OrderChangeRequest {
  const row = record(value)
  const kind = row["kind"]
  const refundConflict = row["refundConflict"]
  if ((kind !== "replacement" && kind !== "addition") || typeof refundConflict !== "boolean") throw invalidResponse()
  const proposed = record(row["proposedParticipant"])
  const participantKind = proposed["participantKind"]
  if (participantKind !== "student" && participantKind !== "adult") throw invalidResponse()
  const original = record(row["originalSnapshot"])
  return {
    id: text(row, "id"), orderId: text(row, "orderId"), orderCode: text(row, "orderCode"), kind, originalLineId: nullableText(row, "originalLineId"),
    reason: text(row, "reason"), status: status(row["status"]), version: count(row, "version"),
    proposedParticipant: { displayName: text(proposed, "displayName"), participantKind, schoolName: text(proposed, "schoolName"), gradeName: nullableText(proposed, "gradeName"), className: nullableText(proposed, "className"), identityNumberMasked: text(proposed, "identityNumberMasked"), phoneMasked: text(proposed, "phoneMasked") },
    originalSnapshot: { amountFen: count(original, "amountFen"), paidFen: count(original, "paidFen"), lines: collection(original["lines"]).map((value) => { const line = record(value); return { id: text(line, "id"), displayName: text(line, "displayName"), amountFen: count(line, "amountFen") } }) },
    history: collection(row["history"]).map((value) => { const entry = record(value); return { version: count(entry, "version"), status: status(entry["status"]), action: text(entry, "action"), note: text(entry, "note"), actorName: text(entry, "actorName"), at: text(entry, "at") } }),
    refundConflict, createdAt: text(row, "createdAt"), updatedAt: text(row, "updatedAt"),
  }
}

function status(value: unknown): OrderChangeStatus {
  if (value === "submitted" || value === "needs_information" || value === "approved" || value === "rejected" || value === "withdrawn") return value
  throw invalidResponse()
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) }
function record(value: unknown): Record<string, unknown> { if (isRecord(value)) return value; throw invalidResponse() }
function collection(value: unknown): readonly unknown[] { if (Array.isArray(value)) return value; throw invalidResponse() }
function text(row: Record<string, unknown>, key: string): string { const value = row[key]; if (typeof value === "string") return value; throw invalidResponse() }
function nullableText(row: Record<string, unknown>, key: string): string | null { const value = row[key]; if (value === null || typeof value === "string") return value; throw invalidResponse() }
function count(row: Record<string, unknown>, key: string): number { const value = row[key]; if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value; throw invalidResponse() }
function invalidResponse(): RosterApiError { return new RosterApiError(0, "人员变更申请暂时无法读取，请重试") }
