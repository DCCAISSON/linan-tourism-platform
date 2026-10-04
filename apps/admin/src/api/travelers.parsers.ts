import { RosterApiError } from "./roster.errors"
import type { TravelerList, TravelerRow } from "./travelers.types"

export function parseTravelerList(value: unknown): TravelerList {
  const record = readRecord(value, "出行名单")
  const travelers = record["travelers"]
  if (!Array.isArray(travelers)) throw new RosterApiError(0, "出行名单明细响应格式不正确")
  return {
    tourSessionId: readString(record, "tourSessionId", "出行名单"),
    organizationId: readString(record, "organizationId", "出行名单"),
    rosterVersion: readString(record, "rosterVersion", "出行名单"),
    activeCount: readNumber(record, "activeCount", "出行名单"),
    inactiveCount: readNumber(record, "inactiveCount", "出行名单"),
    conflictCount: readNumber(record, "conflictCount", "出行名单"),
    total: readNumber(record, "total", "出行名单"),
    page: readNumber(record, "page", "出行名单"),
    pageSize: readNumber(record, "pageSize", "出行名单"),
    travelers: travelers.map(parseTravelerRow),
  }
}

function parseTravelerRow(value: unknown): TravelerRow {
  const record = readRecord(value, "出行名单人员")
  const sourceRefs = record["sourceRefs"]
  if (!Array.isArray(sourceRefs) || !sourceRefs.every(item => typeof item === "string")) {
    throw new RosterApiError(0, "出行名单人员.sourceRefs 响应格式不正确")
  }
  return {
    personRef: readString(record, "personRef", "出行名单人员"),
    sourceRefs,
    source: readSource(record, "source"),
    tourSessionId: readString(record, "tourSessionId", "出行名单人员"),
    organizationId: readString(record, "organizationId", "出行名单人员"),
    displayName: readString(record, "displayName", "出行名单人员"),
    gradeId: readNullableString(record, "gradeId", "出行名单人员"),
    classId: readNullableString(record, "classId", "出行名单人员"),
    gradeName: readNullableString(record, "gradeName", "出行名单人员"),
    className: readNullableString(record, "className", "出行名单人员"),
    participantKind: readParticipantKind(record["participantKind"]),
    importedRole: readImportedRole(record["importedRole"]),
    identityMasked: readNullableString(record, "identityMasked", "出行名单人员"),
    phoneMasked: readNullableString(record, "phoneMasked", "出行名单人员"),
    active: readBoolean(record, "active", "出行名单人员"),
    inactiveReason: readInactiveReason(record["inactiveReason"]),
    eligibility: readEligibility(record, "eligibility"),
    eligibilityReason: readNullableString(record, "eligibilityReason", "出行名单人员"),
    importVersion: readNullableNumber(record, "importVersion", "出行名单人员"),
    conflict: parseConflict(record["conflict"]),
  }
}

function parseConflict(value: unknown): TravelerRow["conflict"] {
  if (value === null) return null
  const record = readRecord(value, "出行名单冲突")
  const sourceRefs = record["sourceRefs"]
  if (!Array.isArray(sourceRefs) || !sourceRefs.every(item => typeof item === "string")) {
    throw new RosterApiError(0, "出行名单冲突.sourceRefs 响应格式不正确")
  }
  const code = readString(record, "code", "出行名单冲突")
  if (code === "identity_fields_conflict" || code === "duplicate_paid_sources" || code === "eligibility_conflict") {
    return { code, sourceRefs }
  }
  throw new RosterApiError(0, "出行名单冲突.code 响应格式不正确")
}

function readRecord(value: unknown, itemName: string): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return Object.fromEntries(Object.entries(value))
  throw new RosterApiError(0, `${itemName}响应格式不正确`)
}

function readString(record: Record<string, unknown>, key: string, itemName: string): string {
  const value = record[key]
  if (typeof value === "string") return value
  throw new RosterApiError(0, `${itemName}.${key} 响应格式不正确`)
}

function readNullableString(record: Record<string, unknown>, key: string, itemName: string): string | null {
  const value = record[key]
  if (value === null || typeof value === "string") return value
  throw new RosterApiError(0, `${itemName}.${key} 响应格式不正确`)
}

function readNumber(record: Record<string, unknown>, key: string, itemName: string): number {
  const value = record[key]
  if (typeof value === "number" && Number.isFinite(value)) return value
  throw new RosterApiError(0, `${itemName}.${key} 响应格式不正确`)
}

function readNullableNumber(record: Record<string, unknown>, key: string, itemName: string): number | null {
  const value = record[key]
  if (value === null) return null
  if (typeof value === "number" && Number.isFinite(value)) return value
  throw new RosterApiError(0, `${itemName}.${key} 响应格式不正确`)
}

function readBoolean(record: Record<string, unknown>, key: string, itemName: string): boolean {
  const value = record[key]
  if (typeof value === "boolean") return value
  throw new RosterApiError(0, `${itemName}.${key} 响应格式不正确`)
}

function readSource(record: Record<string, unknown>, key: string): TravelerRow["source"] {
  const value = readString(record, key, "出行名单人员")
  if (value === "paid" || value === "imported") return value
  throw new RosterApiError(0, "出行名单人员.source 响应格式不正确")
}

function readEligibility(record: Record<string, unknown>, key: string): TravelerRow["eligibility"] {
  const value = readString(record, key, "出行名单人员")
  if (value === "paid" || value === "teacher" || value === "confirmed" || value === "pending" || value === "disabled") return value
  throw new RosterApiError(0, "出行名单人员.eligibility 响应格式不正确")
}

function readParticipantKind(value: unknown): TravelerRow["participantKind"] {
  if (value === null || value === "student" || value === "adult") return value
  throw new RosterApiError(0, "出行名单人员.participantKind 响应格式不正确")
}

function readImportedRole(value: unknown): TravelerRow["importedRole"] {
  if (value === null || value === "student" || value === "guardian" || value === "teacher") return value
  throw new RosterApiError(0, "出行名单人员.importedRole 响应格式不正确")
}

function readInactiveReason(value: unknown): TravelerRow["inactiveReason"] {
  if (value === null || value === "cancelled" || value === "payment_inactive" || value === "import_disabled" || value === "eligibility_pending") return value
  throw new RosterApiError(0, "出行名单人员.inactiveReason 响应格式不正确")
}
