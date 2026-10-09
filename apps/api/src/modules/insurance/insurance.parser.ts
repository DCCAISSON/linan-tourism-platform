import { BadRequestException } from "@nestjs/common"
import type { CreateInsuranceBatchInput, InsuranceChangeHandoffInput, InsuranceManualResultInput, SubmitInsuranceBatchInput } from "./insurance.service.js"
import type { InsuranceExportKind, InsurancePlan } from "./insurance.types.js"

export function parseInsurancePlan(value: unknown): InsurancePlan | null {
  const input = readRecord(value)
  if (!Object.hasOwn(input, "plan") || Object.keys(input).some((key) => key !== "plan")) throw malformed("请提供保险方案")
  if (input["plan"] === null) return null
  const plan = readRecord(input["plan"])
  const keys = ["insurerName", "planName", "coverageSummary", "notice"]
  if (Object.keys(plan).some((key) => !keys.includes(key))) throw malformed("保险方案包含未知字段")
  const insurerName = readPlanText(plan["insurerName"], 120)
  const planName = readPlanText(plan["planName"], 120)
  const coverageSummary = readPlanText(plan["coverageSummary"], 4000)
  if (insurerName === null || planName === null || coverageSummary === null) throw malformed("请填写保险公司、方案名称和保障内容")
  return {
    insurerName,
    planName,
    coverageSummary,
    notice: readPlanText(plan["notice"], 2000),
  }
}

function readPlanText(value: unknown, maxLength: number): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== "string") throw malformed("保险方案内容必须是文字")
  const text = value.trim()
  if (text.length > maxLength) throw malformed("保险方案内容超出长度限制")
  return text.length === 0 ? null : text
}

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
  const coverageStart = readOptionalDate(record, "coverageStart")
  const coverageEnd = readOptionalDate(record, "coverageEnd")
  if (coverageStart !== null && coverageEnd !== null && coverageStart > coverageEnd) throw malformed("保障结束日期不能早于开始日期")
  return {
    success,
    receiptReference: readOptionalText(record, "receiptReference", 255),
    policyNumber: readOptionalText(record, "policyNumber", 120),
    coverageStart,
    coverageEnd,
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
  const timestamp = Date.parse(`${value}T00:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) throw malformed("保障日期不正确，请填写有效日期")
  return value
}

function malformed(message: string): BadRequestException {
  return new BadRequestException({ code: "malformed_input", message })
}
