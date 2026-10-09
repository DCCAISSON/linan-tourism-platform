import { ApiError } from "./api-error"
import { DEV_FAMILY_IDENTITY_HEADER, FALLBACK_API_BASE_URL, type MiniappApiOptions, type RequestTransport } from "./api-types"
import { readCollection, readIsoString, readRecord, readString } from "./api-parsers"
import { clearWechatSessionTokenIfCurrent, getWechatSessionToken } from "./wechat-token"

export type InsurancePlan = {
  readonly insurerName: string
  readonly planName: string
  readonly coverageSummary: string
  readonly notice: string | null
}
const batchStatuses = ["draft", "blocked", "submitted", "insured", "failed", "change_pending"] as const
const personStatuses = ["ready", "blocked", "submitted", "insured", "failed", "cancellation_requested"] as const
const refundStatuses = ["none", "pending", "refunded", "failed"] as const
export type FamilyInsuranceRecord = {
  readonly batchId: string
  readonly batchStatus: typeof batchStatuses[number]
  readonly status: typeof personStatuses[number]
  readonly planSnapshot: InsurancePlan | null
  readonly policyNumber: string | null
  readonly coverageStart: string | null
  readonly coverageEnd: string | null
  readonly createdAt: string
  readonly submittedAt: string | null
}
export type FamilyInsuranceResponse = {
  readonly orderId: string
  readonly tourSessionId: string
  readonly currentPlan: InsurancePlan | null
  readonly people: readonly {
    readonly orderLineId: string
    readonly displayName: string
    readonly refundStatus: typeof refundStatuses[number]
    readonly records: readonly FamilyInsuranceRecord[]
  }[]
}

export function createInsuranceApi(options: MiniappApiOptions = {}) {
  const baseUrl = (options.baseUrl ?? import.meta.env["VITE_API_BASE_URL"] ?? FALLBACK_API_BASE_URL).replace(/\/$/, "")
  const familyIdentity = options.familyIdentityHeader ?? import.meta.env["VITE_DEV_FAMILY_IDENTITY_HEADER"]
  const transport: RequestTransport = options.request ?? (input => new Promise((resolve, reject) => uni.request({ ...input, success: resolve, fail: reject })))
  return {
    getInsurance: async (orderId: string): Promise<FamilyInsuranceResponse> => {
      const token = options.wechatSessionToken ?? getWechatSessionToken()
      if (!token && !familyIdentity) throw new ApiError(401, "请先登录后查看出行保障。")
      const header: Record<string, string> = {}
      if (token) header["Authorization"] = `Bearer ${token}`
      if (familyIdentity) header[DEV_FAMILY_IDENTITY_HEADER] = familyIdentity
      try {
        const response = await transport({ url: `${baseUrl}/orders/${encodeURIComponent(orderId)}/insurance`, method: "GET", header })
        if (response.statusCode === 401) {
          if (token) clearWechatSessionTokenIfCurrent(token)
          throw new ApiError(401, "登录状态已失效，请重新登录。")
        }
        if (response.statusCode === 404) throw new ApiError(404, "无法查看这笔订单的保障信息，请返回我的订单重新打开。")
        if (response.statusCode < 200 || response.statusCode >= 300) throw new ApiError(response.statusCode, "保障信息加载失败，请稍后重试。")
        const result = parseInsurance(response.data)
        if (result.orderId !== orderId) throw new ApiError(0, "保障信息与当前订单不一致，请重新打开订单。")
        return result
      } catch (cause) {
        if (cause instanceof ApiError) throw cause
        throw new ApiError(0, "保障信息加载失败，请检查网络后重试。")
      }
    },
  }
}

function parseInsurance(value: unknown): FamilyInsuranceResponse {
  const record = readRecord(value)
  return {
    orderId: readString(record, "orderId"), tourSessionId: readString(record, "tourSessionId"), currentPlan: parsePlan(record["currentPlan"]),
    people: readCollection(record["people"], item => {
      const person = readRecord(item)
      return { orderLineId: readString(person, "orderLineId"), displayName: readString(person, "displayName"), refundStatus: readChoice(person, "refundStatus", refundStatuses), records: readCollection(person["records"], parseInsuranceRecord) }
    }),
  }
}

function parsePlan(value: unknown): InsurancePlan | null {
  if (value === null) return null
  const record = readRecord(value)
  const notice = nullableText(record, "notice")
  if (notice !== null && notice.length > 2000) throw invalid()
  return { insurerName: boundedText(record, "insurerName", 120), planName: boundedText(record, "planName", 120), coverageSummary: boundedText(record, "coverageSummary", 4000), notice }
}

function parseInsuranceRecord(value: unknown): FamilyInsuranceRecord {
  const record = readRecord(value)
  const coverageStart = coverageDate(record, "coverageStart"), coverageEnd = coverageDate(record, "coverageEnd")
  if (coverageStart !== null && coverageEnd !== null && coverageStart > coverageEnd) throw invalid()
  return {
    batchId: readString(record, "batchId"), batchStatus: readChoice(record, "batchStatus", batchStatuses), status: readChoice(record, "status", personStatuses),
    planSnapshot: parsePlan(record["planSnapshot"]), policyNumber: nullableText(record, "policyNumber"), coverageStart, coverageEnd,
    createdAt: readIsoString(record, "createdAt"), submittedAt: record["submittedAt"] === null ? null : readIsoString(record, "submittedAt"),
  }
}

function readChoice<T extends string>(record: Record<string, unknown>, key: string, choices: readonly T[]): T {
  const match = choices.find(choice => choice === record[key])
  if (match === undefined) throw invalid()
  return match
}
function boundedText(record: Record<string, unknown>, key: string, maximum: number): string {
  const value = readString(record, key)
  if (value.length > maximum) throw invalid()
  return value
}
function nullableText(record: Record<string, unknown>, key: string): string | null {
  return record[key] === null ? null : readString(record, key)
}
function coverageDate(record: Record<string, unknown>, key: string): string | null {
  const value = nullableText(record, key)
  if (value === null) return null
  const timestamp = Date.parse(`${value}T00:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) throw invalid()
  return value
}
function invalid(): ApiError { return new ApiError(0, "保障信息暂时无法读取，请重试。") }
