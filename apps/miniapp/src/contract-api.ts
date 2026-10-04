import { ApiError, resolveApiBaseUrl, resolveDevFamilyIdentityHeader } from "./api"
import { DEV_FAMILY_IDENTITY_HEADER, type MiniappApiOptions, type MiniappRequestOptions, type MiniappRequestResult } from "./api-types"
import { readCollection, readErrorMessage, readIsoString, readNonNegativeInteger, readRecord, readString } from "./api-parsers"
import { getWechatSessionToken } from "./wechat-token"
import type { ContractSignature, OrderContract, SignContractInput } from "./contract-types"

export type { ContractSignature, OrderContract, SignContractInput } from "./contract-types"

export function createContractApi(options: MiniappApiOptions = {}) {
  const baseUrl = resolveApiBaseUrl(options.baseUrl)
  const identity = resolveDevFamilyIdentityHeader(options.familyIdentityHeader)
  const token = options.wechatSessionToken ?? getWechatSessionToken()
  const transport = options.request ?? ((input: MiniappRequestOptions) => new Promise<MiniappRequestResult>((resolve, reject) => {
    uni.request({ ...input, success: resolve, fail: reject })
  }))
  async function request(orderId: string, input?: SignContractInput): Promise<OrderContract | null> {
    const header: Record<string, string> = { "Content-Type": "application/json" }
    if (identity) header[DEV_FAMILY_IDENTITY_HEADER] = identity
    if (token) header["Authorization"] = `Bearer ${token}`
    const url = `${baseUrl}/orders/${encodeURIComponent(orderId)}/contract${input ? "/sign" : ""}`
    const response = await transport(input ? { url, header, method: "POST", data: input } : { url, header, method: "GET" })
    if (response.statusCode < 200 || response.statusCode >= 300) throw new ApiError(response.statusCode, readErrorMessage(response.data) ?? "合同暂时无法读取，请重试。")
    const contract = parseOrderContract(readRecord(response.data)["contract"])
    if (contract && (contract.orderId !== orderId || contract.order.id !== orderId)) throw new ApiError(0, "合同与当前订单不一致，请重新打开订单。")
    if (input && contract?.status !== "parent_signed_pending_agency") throw new ApiError(0, "签字结果尚未确认，请刷新合同。")
    return contract
  }
  return { getContract: (orderId: string) => request(orderId), signContract: (orderId: string, input: SignContractInput) => request(orderId, input) }
}

function nullableText(record: Record<string, unknown>, key: string): string | null {
  return record[key] === null ? null : readString(record, key)
}
function parseSignature(value: unknown): ContractSignature | null {
  if (value === null) return null
  const record = readRecord(value)
  const width = readNonNegativeInteger(record, "width")
  const height = readNonNegativeInteger(record, "height")
  if (width < 100 || width > 2000 || height < 100 || height > 2000) throw new ApiError(0, "签字记录无法读取，请重试。")
  const strokes = readCollection(record["strokes"], stroke => readCollection(stroke, point => {
    const coordinates = readRecord(point)
    const x = coordinates["x"], y = coordinates["y"]
    if (typeof x !== "number" || !Number.isFinite(x) || x < 0 || x > width || typeof y !== "number" || !Number.isFinite(y) || y < 0 || y > height) throw new ApiError(0, "签字记录无法读取，请重试。")
    return { x, y }
  }))
  if (strokes.length > 100 || strokes.reduce((sum, stroke) => sum + stroke.length, 0) > 5000) throw new ApiError(0, "签字记录无法读取，请重试。")
  return { width, height, strokes }
}
export function parseOrderContract(value: unknown): OrderContract | null {
  if (value === null) return null
  const record = readRecord(value), template = readRecord(record["template"]), order = readRecord(record["order"])
  const status = record["status"]
  if (status !== "pending_parent_signature" && status !== "parent_signed_pending_agency") throw new ApiError(0, "合同状态无法读取，请重试。")
  if (record["signingScope"] !== "individual_reading_confirmation") throw new ApiError(0, "合同签字范围无法确认，请重新加载。")
  const signature = parseSignature(record["signature"])
  const signerName = nullableText(record, "signerName"), signedAt = nullableText(record, "signedAt")
  if (status === "parent_signed_pending_agency" && (!signature || !signedAt || !signerName)) throw new ApiError(0, "签字结果尚未确认，请刷新合同。")
  return {
    id: readString(record, "id"), orderId: readString(record, "orderId"), status, snapshotHash: readString(record, "snapshotHash"), signingScope: "individual_reading_confirmation",
    template: { title: readString(template, "title"), version: readString(template, "version"), kind: readString(template, "kind"), bodyText: readString(template, "bodyText"), bodySha256: readString(template, "bodySha256"), sourceFilename: readString(template, "sourceFilename"), sourceSha256: readString(template, "sourceSha256") },
    order: { id: readString(order, "id"), code: readString(order, "code"), payerName: readString(order, "payerName"), amountFen: readNonNegativeInteger(order, "amountFen"), startsAt: readIsoString(order, "startsAt"), endsAt: readIsoString(order, "endsAt") },
    participants: readCollection(record["participants"], person => {
      const participant = readRecord(person), kind = participant["kind"]
      if (kind !== "student" && kind !== "adult") throw new ApiError(0, "合同参加人无法读取，请重试。")
      return { name: readString(participant, "name"), kind, identityMasked: nullableText(participant, "identityMasked"), amountFen: readNonNegativeInteger(participant, "amountFen") }
    }),
    scopeStatement: readString(record, "scopeStatement"), signature, signerName, signedAt,
  }
}
