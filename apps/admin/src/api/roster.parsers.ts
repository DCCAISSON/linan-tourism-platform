import { RosterApiError } from "./roster.errors"
import type { RosterFilters, RosterRow, RosterSummary } from "./roster.types"

export function parseRosterSummary(value: unknown): RosterSummary {
  const record = readRecord(value, "名单统计")
  const rows = record["rows"]

  if (!Array.isArray(rows)) {
    throw new RosterApiError(0, "名单明细响应格式不正确")
  }

  return {
    filters: parseRosterFilters(record["filters"]),
    paidHeadcount: readNumber(record, "paidHeadcount", "名单统计"),
    paidAmountFen: readNumber(record, "paidAmountFen", "名单统计"),
    rows: rows.map(parseRosterRow),
  }
}

function parseRosterFilters(value: unknown): RosterFilters {
  const record = readRecord(value, "筛选条件")
  const schoolId = readNullableOptionalString(record, "schoolId", "筛选条件")
  const gradeId = readNullableOptionalString(record, "gradeId", "筛选条件")
  const classId = readNullableOptionalString(record, "classId", "筛选条件")

  return {
    tourSessionId: readString(record, "tourSessionId", "筛选条件"),
    ...(schoolId == null ? {} : { schoolId }),
    ...(gradeId == null ? {} : { gradeId }),
    ...(classId == null ? {} : { classId }),
  }
}

function parseRosterRow(value: unknown): RosterRow {
  const record = readRecord(value, "名单明细")

  return {
    participantId: readString(record, "participantId", "名单明细"),
    displayName: readString(record, "displayName", "名单明细"),
    schoolId: readString(record, "schoolId", "名单明细"),
    schoolName: readString(record, "schoolName", "名单明细"),
    gradeId: readNullableString(record, "gradeId", "名单明细"),
    gradeName: readNullableString(record, "gradeName", "名单明细"),
    classId: readNullableString(record, "classId", "名单明细"),
    className: readNullableString(record, "className", "名单明细"),
    amountFen: readNumber(record, "amountFen", "名单明细"),
  }
}

function readRecord(value: unknown, itemName: string): Record<string, unknown> {
  if (isRecord(value)) {
    return value
  }

  throw new RosterApiError(0, `${itemName}响应格式不正确`)
}

function readString(record: Record<string, unknown>, key: string, itemName: string): string {
  const value = record[key]
  if (typeof value === "string") {
    return value
  }

  throw new RosterApiError(0, `${itemName}.${key} 响应格式不正确`)
}

function readNullableOptionalString(
  record: Record<string, unknown>,
  key: string,
  itemName: string,
): string | null | undefined {
  const value = record[key]
  if (value === undefined || value === null) {
    return value
  }

  if (typeof value === "string") {
    return value
  }

  throw new RosterApiError(0, `${itemName}.${key} 响应格式不正确`)
}

function readNullableString(
  record: Record<string, unknown>,
  key: string,
  itemName: string,
): string | null {
  const value = record[key]
  if (value === null || typeof value === "string") {
    return value
  }

  throw new RosterApiError(0, `${itemName}.${key} 响应格式不正确`)
}

function readNumber(record: Record<string, unknown>, key: string, itemName: string): number {
  const value = record[key]
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  throw new RosterApiError(0, `${itemName}.${key} 响应格式不正确`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
