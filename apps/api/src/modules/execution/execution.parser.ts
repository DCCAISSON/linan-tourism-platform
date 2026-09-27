import { BadRequestException } from "@nestjs/common"
import type { PersonRef } from "../travelers/travelers.types.js"
import type { AttendanceStatus, DailyReportInput, EventInput, HealthAuthorizationInput, PublicApprovalInput } from "./execution.types.js"

export function parsePersonRef(value: string): PersonRef {
  const decoded = decodeURIComponent(value)
  if (decoded.startsWith("paid:") || decoded.startsWith("imported:")) return decoded as PersonRef
  throw malformedExecutionInput("人员引用格式不正确")
}

export function parseAttendanceInput(value: unknown) {
  const record = readRecord(value, "点名记录")
  const status = readText(record, "status", 16)
  if (status !== "present" && status !== "absent" && status !== "revoked") throw malformedExecutionInput("点名状态不正确")
  return {
    status: status as AttendanceStatus,
    infoChecked: readBoolean(record, "infoChecked"),
    groupJoined: readBoolean(record, "groupJoined"),
    note: readOptionalText(record, "note", 500),
  }
}

export function parseDailyReportInput(value: unknown): DailyReportInput {
  const record = readRecord(value, "日报")
  const reportDate = readText(record, "reportDate", 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) throw malformedExecutionInput("日报日期格式不正确")
  return {
    reportDate,
    lodgingCheck: readText(record, "lodgingCheck", 4000),
    mealStatus: readText(record, "mealStatus", 4000),
    bodyStatus: readText(record, "bodyStatus", 4000),
    note: readOptionalText(record, "note", 4000),
  }
}

export function parseEventInput(value: unknown): EventInput {
  const record = readRecord(value, "事件")
  const category = readText(record, "category", 32)
  if (category !== "objective" && category !== "health" && category !== "safety" && category !== "other") throw malformedExecutionInput("事件分类不正确")
  const occurredAt = new Date(readText(record, "occurredAt", 40))
  if (Number.isNaN(occurredAt.getTime())) throw malformedExecutionInput("事件时间不正确")
  const personRef = readNullableText(record, "personRef", 128)
  return {
    category,
    occurredAt,
    personRef: personRef === null ? null : parsePersonRef(personRef),
    content: readText(record, "content", 4000),
  }
}

export function parsePersonDailyInput(value: unknown) {
  const record = readRecord(value, "个人日报")
  const reportDate = readText(record, "reportDate", 10)
  const parsed = new Date(`${reportDate}T00:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== reportDate) throw malformedExecutionInput("日报日期不正确")
  const expectedVersion = record["expectedVersion"]
  if (typeof expectedVersion !== "number" || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw malformedExecutionInput("请提供当前日报版本，新建时为0")
  return { reportDate, expectedVersion, lodgingCheck: readText(record, "lodgingCheck", 4000), mealStatus: readText(record, "mealStatus", 4000), bodyStatus: readOptionalText(record, "bodyStatus", 4000), note: readOptionalText(record, "note", 4000) }
}

export function parsePersonDailyApproval(value: unknown) {
  const record = readRecord(value, "个人日报公开摘要")
  const expectedVersion = record["expectedVersion"]
  if (typeof expectedVersion !== "number" || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw malformedExecutionInput("请提供当前日报版本")
  return { ...parsePublicApproval(value), expectedVersion }
}

export function parsePublicApproval(value: unknown): PublicApprovalInput {
  const record = readRecord(value, "公开摘要")
  return { publicSummary: readText(record, "publicSummary", 1000) }
}

export function parseHealthAuthorization(value: unknown): HealthAuthorizationInput {
  const record = readRecord(value, "健康授权")
  return {
    personRef: parsePersonRef(readText(record, "personRef", 128)),
    allergies: readOptionalText(record, "allergies", 1000),
    medicalNotes: readOptionalText(record, "medicalNotes", 2000),
    emergencyMedicine: readOptionalText(record, "emergencyMedicine", 1000),
  }
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return Object.fromEntries(Object.entries(value))
  throw malformedExecutionInput(`${label}必须是对象`)
}

function readText(record: Record<string, unknown>, key: string, maxLength: number): string {
  const value = readOptionalText(record, key, maxLength)
  if (value.length === 0) throw malformedExecutionInput(`${key}不能为空`)
  return value
}

function readOptionalText(record: Record<string, unknown>, key: string, maxLength: number): string {
  const value = record[key]
  if (value === undefined || value === null) return ""
  if (typeof value !== "string" || value.length > maxLength) throw malformedExecutionInput(`${key}格式不正确`)
  return value.trim()
}

function readNullableText(record: Record<string, unknown>, key: string, maxLength: number): string | null {
  const value = record[key]
  if (value === undefined || value === null) return null
  if (typeof value !== "string" || value.length > maxLength) throw malformedExecutionInput(`${key}格式不正确`)
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

function readBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key]
  if (typeof value === "boolean") return value
  throw malformedExecutionInput(`${key}必须是布尔值`)
}

export function malformedExecutionInput(message: string): BadRequestException {
  return new BadRequestException({ code: "execution_input_invalid", message })
}

export function parseGuideAssignment(value: unknown, tourSessionId: string) {
  const record = readRecord(value, "导游指派")
  const vehicleId = readOptionalText(record, "vehicleId", 64)
  return { staffAccountId: readText(record, "staffAccountId", 64), tourSessionId, ...(vehicleId.length === 0 ? {} : { vehicleId }), reason: readText(record, "reason", 500) }
}
export function parseAssignmentReason(value: unknown): string { return readText(readRecord(value, "撤销指派"), "reason", 500) }
