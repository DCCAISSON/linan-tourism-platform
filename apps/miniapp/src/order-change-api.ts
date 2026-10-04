import { ApiError } from "./api-error"
import { readCollection, readErrorMessage, readNonNegativeInteger, readRecord, readString } from "./api-parsers"
import { FALLBACK_API_BASE_URL, type MiniappRequestOptions, type MiniappRequestResult, type RequestTransport } from "./api-types"
import { getWechatSessionToken } from "./wechat-token"

export type OrderChangeStatus = "submitted" | "needs_information" | "approved" | "rejected" | "withdrawn"
export type OrderChangeKind = "replacement" | "addition"
export const orderChangeStatusLabels = { submitted: "待审核", needs_information: "待补充材料", approved: "审核通过·待实际处理", rejected: "已驳回", withdrawn: "已撤回" } as const

export type ChangeParticipantInput = {
  readonly displayName: string
  readonly participantKind: "student" | "adult"
  readonly identityNumber: string
  readonly phone: string
  readonly schoolId?: string
  readonly gradeId?: string
  readonly classId?: string
}

export type ChangeParticipant = {
  readonly displayName: string
  readonly participantKind: "student" | "adult"
  readonly schoolId: string
  readonly schoolName: string
  readonly gradeId: string | null
  readonly gradeName: string | null
  readonly classId: string | null
  readonly className: string | null
  readonly identityNumberMasked: string
  readonly phoneMasked: string
}

export type OrderChangeRequest = {
  readonly id: string
  readonly orderId: string
  readonly orderCode: string
  readonly kind: OrderChangeKind
  readonly originalLineId: string | null
  readonly reason: string
  readonly status: OrderChangeStatus
  readonly version: number
  readonly proposedParticipant: ChangeParticipant
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

export type FamilyOrderChanges = { readonly schoolId: string; readonly activeRefundLineIds: readonly string[]; readonly requests: readonly OrderChangeRequest[] }
export type SubmitOrderChangeInput = { readonly kind: OrderChangeKind; readonly originalLineId: string | null; readonly participant: ChangeParticipantInput; readonly reason: string; readonly idempotencyKey: string }

export function createOrderChangeClient(options: { readonly baseUrl?: string; readonly wechatSessionToken?: string; readonly request?: RequestTransport } = {}) {
  const baseUrl = (options.baseUrl ?? import.meta.env["VITE_API_BASE_URL"] ?? FALLBACK_API_BASE_URL).replace(/\/$/, "")
  const transport = options.request ?? requestWithUni
  async function request(path: string, data?: object): Promise<unknown> {
    const token = options.wechatSessionToken ?? getWechatSessionToken()
    const header: Record<string, string> = { "Content-Type": "application/json" }
    if (token !== undefined) header["Authorization"] = `Bearer ${token}`
    const response = await transport(data === undefined ? { url: `${baseUrl}${path}`, method: "GET", header } : { url: `${baseUrl}${path}`, method: "POST", header, data })
    if (response.statusCode < 200 || response.statusCode >= 300) throw new ApiError(response.statusCode, readErrorMessage(response.data) ?? "人员变更申请暂时无法处理，请稍后重试")
    return response.data
  }
  const path = (orderId: string) => `/orders/${encodeURIComponent(orderId)}/change-requests`
  return {
    list: async (orderId: string): Promise<FamilyOrderChanges> => {
      const record = readRecord(await request(path(orderId)))
      return { schoolId: readString(record, "schoolId"), activeRefundLineIds: readCollection(record["activeRefundLineIds"], (value) => { if (typeof value !== "string") throw invalidResponse(); return value }), requests: readCollection(record["requests"], parseOrderChange) }
    },
    submit: async (orderId: string, input: SubmitOrderChangeInput): Promise<OrderChangeRequest> => parseOrderChange(await request(path(orderId), input)),
    supplement: async (orderId: string, id: string, input: { readonly expectedVersion: number; readonly reason: string; readonly participant?: ChangeParticipantInput }): Promise<OrderChangeRequest> => parseOrderChange(await request(`${path(orderId)}/${encodeURIComponent(id)}/supplement`, input)),
    withdraw: async (orderId: string, id: string, expectedVersion: number): Promise<OrderChangeRequest> => parseOrderChange(await request(`${path(orderId)}/${encodeURIComponent(id)}/withdraw`, { expectedVersion })),
  }
}

export function parseOrderChange(value: unknown): OrderChangeRequest {
  const row = readRecord(value)
  const kind = row["kind"]
  const refundConflict = row["refundConflict"]
  if ((kind !== "replacement" && kind !== "addition") || typeof refundConflict !== "boolean") throw invalidResponse()
  const original = readRecord(row["originalSnapshot"])
  return {
    id: readString(row, "id"), orderId: readString(row, "orderId"), orderCode: readString(row, "orderCode"), kind, originalLineId: nullableText(row, "originalLineId"),
    reason: readString(row, "reason"), status: status(row["status"]), version: readNonNegativeInteger(row, "version"), proposedParticipant: parseParticipant(row["proposedParticipant"]),
    originalSnapshot: { amountFen: readNonNegativeInteger(original, "amountFen"), paidFen: readNonNegativeInteger(original, "paidFen"), lines: readCollection(original["lines"], (value) => {
      const line = readRecord(value)
      return { id: readString(line, "id"), displayName: readString(line, "displayName"), amountFen: readNonNegativeInteger(line, "amountFen") }
    }) },
    history: readCollection(row["history"], (value) => {
      const entry = readRecord(value)
      return { version: readNonNegativeInteger(entry, "version"), status: status(entry["status"]), action: readString(entry, "action"), note: readString(entry, "note"), actorName: readString(entry, "actorName"), at: readString(entry, "at") }
    }),
    refundConflict, createdAt: readString(row, "createdAt"), updatedAt: readString(row, "updatedAt"),
  }
}

function parseParticipant(value: unknown): ChangeParticipant {
  const row = readRecord(value)
  const kind = row["participantKind"]
  if (kind !== "student" && kind !== "adult") throw invalidResponse()
  return { displayName: readString(row, "displayName"), participantKind: kind, schoolId: readString(row, "schoolId"), schoolName: readString(row, "schoolName"), gradeId: nullableText(row, "gradeId"), gradeName: nullableText(row, "gradeName"), classId: nullableText(row, "classId"), className: nullableText(row, "className"), identityNumberMasked: readString(row, "identityNumberMasked"), phoneMasked: readString(row, "phoneMasked") }
}

function status(value: unknown): OrderChangeStatus {
  if (value === "submitted" || value === "needs_information" || value === "approved" || value === "rejected" || value === "withdrawn") return value
  throw invalidResponse()
}

function nullableText(row: Record<string, unknown>, key: string): string | null {
  const value = row[key]
  if (value === null || typeof value === "string") return value
  throw invalidResponse()
}

function invalidResponse(): ApiError { return new ApiError(0, "人员变更申请暂时无法读取，请重试") }

async function requestWithUni(options: MiniappRequestOptions): Promise<MiniappRequestResult> {
  return new Promise((resolve, reject) => {
    const input: UniApp.RequestOptions = { url: options.url, method: options.method, header: options.header, success: resolve, fail: reject }
    if (options.data !== undefined) input.data = JSON.stringify(options.data)
    uni.request(input)
  })
}
