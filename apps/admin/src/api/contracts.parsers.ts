import { ApiError } from "./configuration.errors"
import type { ContractKind, ContractSession, ContractSignature, ContractSource, ContractTemplate, OrderContract } from "./contracts.types"

export function parseContractSources(value: unknown): readonly ContractSource[] {
  return array(record(value)["sources"]).map(parseSource)
}
function parseSource(value: unknown): ContractSource {
  const data = record(value)
  return { id: text(data["id"]), kind: kind(data["kind"]), title: text(data["title"]), sourceFilename: text(data["sourceFilename"]), sourceSha256: text(data["sourceSha256"]), bodyText: text(data["bodyText"]) }
}
export function parseContractTemplate(value: unknown): ContractTemplate {
  const data = record(value)
  return { ...parseSource(value), tourSessionId: text(data["tourSessionId"]), version: text(data["version"]), bodySha256: text(data["bodySha256"]), createdBy: text(data["createdBy"]), createdAt: text(data["createdAt"]) }
}
export function parseContractSession(value: unknown): ContractSession {
  const data = record(value)
  return { activeTemplateId: nullableText(data["activeTemplateId"]), versions: array(data["versions"]).map(parseContractTemplate) }
}
export function parseOrderContract(value: unknown): OrderContract | null {
  const raw = record(value)["contract"]
  if (raw === null) return null
  const data = record(raw)
  const order = record(data["order"])
  const status = data["status"]
  if (status !== "pending_parent_signature" && status !== "parent_signed_pending_agency") throw invalid()
  const phoneVerified = data["phoneVerified"]
  if (typeof phoneVerified !== "boolean") throw invalid()
  return {
    id: text(data["id"]), orderId: text(data["orderId"]), template: parseContractTemplate(data["template"]), status,
    order: { id: text(order["id"]), code: text(order["code"]), payerName: text(order["payerName"]), amountFen: number(order["amountFen"]), startsAt: text(order["startsAt"]), endsAt: text(order["endsAt"]) },
    participants: array(data["participants"]).map(item => {
      const person = record(item)
      const participantKind = person["kind"]
      if (participantKind !== "student" && participantKind !== "adult") throw invalid()
      return { name: text(person["name"]), kind: participantKind, identityMasked: nullableText(person["identityMasked"]), amountFen: number(person["amountFen"]) }
    }),
    scopeStatement: text(data["scopeStatement"]), snapshotHash: text(data["snapshotHash"]), createdAt: text(data["createdAt"]),
    signedAt: nullableText(data["signedAt"]), signerName: nullableText(data["signerName"]), phoneVerified,
    signature: data["signature"] === null ? null : signature(data["signature"]), signatureHash: nullableText(data["signatureHash"]),
  }
}
function signature(value: unknown): ContractSignature {
  const data = record(value)
  const width = number(data["width"])
  const height = number(data["height"])
  if (width <= 0 || height <= 0) throw invalid()
  return { width, height, strokes: array(data["strokes"]).map(stroke => array(stroke).map(point => {
    const coordinates = record(point)
    const x = number(coordinates["x"])
    const y = number(coordinates["y"])
    if (x < 0 || x > width || y < 0 || y > height) throw invalid()
    return { x, y }
  })) }
}
function kind(value: unknown): ContractKind {
  if (value === "domestic_group_tour" || value === "staff_recuperation") return value
  throw invalid()
}
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalid()
  return Object.fromEntries(Object.entries(value))
}
function array(value: unknown): readonly unknown[] { if (!Array.isArray(value)) throw invalid(); return value }
function text(value: unknown): string { if (typeof value !== "string") throw invalid(); return value }
function nullableText(value: unknown): string | null { return value === null ? null : text(value) }
function number(value: unknown): number { if (typeof value !== "number" || !Number.isFinite(value)) throw invalid(); return value }
function invalid(): ApiError { return new ApiError(0, "合同响应格式不正确，请重试") }
