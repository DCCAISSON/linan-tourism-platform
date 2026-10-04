import { BadRequestException } from "@nestjs/common"
import type { CreateInsuranceBatchInput, InsuranceChangeHandoffInput, InsuranceManualResultInput, SubmitInsuranceBatchInput } from "./insurance.service.js"
import type { InsuranceExportKind } from "./insurance.types.js"

export function parseCreateBatch(value: unknown): CreateInsuranceBatchInput {
  const record = readRecord(value)
  return {
    tourSessionId: readText(record, "tourSessionId", 64),
    expectedRosterVersion: readRosterVersion(record, "expectedRosterVersion"),
    companyTemplateName: readOptionalText(record, "companyTemplateName", 120),
  }
}

export function parseSubmitBatch(value: unknown): SubmitInsuranceBatchInput {
  const record = readRecord(value)
  return {
    expectedRosterVersion: readRosterVersion(record, "expectedRosterVersion"),
    receiptReference: readText(record, "receiptReference", 255),
    note: readText(record, "note", 500),
  }
}

export function parseManualResult(value: unknown): InsuranceManualResultInput {
  const record = readRecord(value)
  const success = record["success"]
  if (typeof success !== "boolean") throw malformed("success 必须是布尔值")
  return {
    success,
    receiptReference: readOptionalText(record, "receiptReference", 255),
    policyNumber: readOptionalText(record, "policyNumber", 120),
    coverageStart: readOptionalDate(record, "coverageStart"),
    coverageEnd: readOptionalDate(record, "coverageEnd"),
    note: readText(record, "note", 500),
  }
}

export function parseChangeHandoff(value: unknown): InsuranceChangeHandoffInput {
  const record = readRecord(value)
  const kind = record["kind"]
  if (kind !== "policy_change" && kind !== "cancellation_change") throw malformed("交接类型不正确")
  return { kind, note: readText(record, "note", 500), receiptReference: readOptionalText(record, "receiptReference", 255) }
}

export function parseExportQuery(value: unknown): { readonly kind: InsuranceExportKind; readonly sensitive: boolean } {
  const record = readRecord(value)
  const kind = record["kind"] ?? "preparation"
  const sensitive = record["sensitive"] ?? "false"
  if (kind !== "preparation" && kind !== "company_template") throw malformed("导出类型不正确")
  if (sensitive !== "true" && sensitive !== "false") throw malformed("sensitive 必须是 true 或 false")
  return { kind, sensitive: sensitive === "true" }
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return Object.fromEntries(Object.entries(value))
  throw malformed("请求格式不正确")
}

function readText(record: Record<string, unknown>, key: string, maxLength: number): string {
  const value = readOptionalText(record, key, maxLength)
  if (value === null || value.length === 0) throw malformed(`${key}不能为空`)
  return value
}

function readOptionalText(record: Record<string, unknown>, key: string, maxLength: number): string | null {
  const value = record[key]
  if (value === undefined || value === null || value === "") return null
  if (typeof value !== "string" || value.length > maxLength) throw malformed(`${key}格式不正确`)
  return value.trim()
}

function readRosterVersion(record: Record<string, unknown>, key: string): string {
  const value = readText(record, key, 64)
  if (!/^[A-Za-z0-9:_-]{1,64}$|^[a-f0-9]{64}$/.test(value)) throw malformed("名单版本不正确")
  return value
}

function readOptionalDate(record: Record<string, unknown>, key: string): string | null {
  const value = readOptionalText(record, key, 10)
  if (value === null) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw malformed(`${key}日期格式不正确`)
  return value
}

function malformed(message: string): BadRequestException {
  return new BadRequestException({ code: "malformed_input", message })
}
