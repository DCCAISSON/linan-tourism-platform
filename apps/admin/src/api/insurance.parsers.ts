import { ApiError } from "./configuration.errors"
import type { InsuranceBatch, InsuranceBatchPerson, InsuranceDiff, InsuranceHandoff, InsurancePreview } from "./insurance.types"

export function parseInsuranceBatch(value: unknown): InsuranceBatch {
  const record = readRecord(value, "保险批次")
  return {
    id: readString(record, "id", "保险批次"),
    tourSessionId: readString(record, "tourSessionId", "保险批次"),
    organizationId: readString(record, "organizationId", "保险批次"),
    rosterVersion: readString(record, "rosterVersion", "保险批次"),
    status: readString(record, "status", "保险批次") as InsuranceBatch["status"],
    companyTemplateName: readNullableString(record, "companyTemplateName", "保险批次"),
    submittedAt: readNullableString(record, "submittedAt", "保险批次"),
    createdAt: readString(record, "createdAt", "保险批次"),
    people: readArray(record, "people", "保险批次").map(parsePerson),
    handoffs: readArray(record, "handoffs", "保险批次").map(parseHandoff),
  }
}

export function parseInsuranceDiff(value: unknown): InsuranceDiff {
  const record = readRecord(value, "保险差异")
  return {
    rosterChanged: readBoolean(record, "rosterChanged", "保险差异"),
    currentRosterVersion: readString(record, "currentRosterVersion", "保险差异"),
    addedRefs: readArray(record, "addedRefs", "保险差异").map((item) => readDirectString(item, "保险差异.addedRefs")),
    removedRefs: readArray(record, "removedRefs", "保险差异").map((item) => readDirectString(item, "保险差异.removedRefs")),
    changedRefs: readArray(record, "changedRefs", "保险差异").map((item) => readDirectString(item, "保险差异.changedRefs")),
  }
}

export function parseInsurancePreview(value: unknown): InsurancePreview {
  const record = readRecord(value, "保险名单预览")
  return {
    tourSessionId: readString(record, "tourSessionId", "保险名单预览"),
    organizationId: readString(record, "organizationId", "保险名单预览"),
    rosterVersion: readString(record, "rosterVersion", "保险名单预览"),
    activeCount: readNumber(record, "activeCount", "保险名单预览"),
    missingIdentityCount: readNumber(record, "missingIdentityCount", "保险名单预览"),
    conflictCount: readNumber(record, "conflictCount", "保险名单预览"),
  }
}

function parsePerson(value: unknown): InsuranceBatchPerson {
  const record = readRecord(value, "保险人员")
  return {
    id: readString(record, "id", "保险人员"),
    personRef: readString(record, "personRef", "保险人员"),
    displayName: readString(record, "displayName", "保险人员"),
    className: readNullableString(record, "className", "保险人员"),
    identityMasked: readNullableString(record, "identityMasked", "保险人员"),
    phoneMasked: readNullableString(record, "phoneMasked", "保险人员"),
    status: readString(record, "status", "保险人员") as InsuranceBatchPerson["status"],
    issueCode: readNullableString(record, "issueCode", "保险人员") as InsuranceBatchPerson["issueCode"],
    policyNumber: readNullableString(record, "policyNumber", "保险人员"),
    receiptReference: readNullableString(record, "receiptReference", "保险人员"),
    coverageStart: readNullableString(record, "coverageStart", "保险人员"),
    coverageEnd: readNullableString(record, "coverageEnd", "保险人员"),
  }
}

function parseHandoff(value: unknown): InsuranceHandoff {
  const record = readRecord(value, "保险交接")
  return {
    id: readString(record, "id", "保险交接"),
    kind: readString(record, "kind", "保险交接") as InsuranceHandoff["kind"],
    note: readString(record, "note", "保险交接"),
    receiptReference: readNullableString(record, "receiptReference", "保险交接"),
    createdAt: readString(record, "createdAt", "保险交接"),
  }
}

function readRecord(value: unknown, itemName: string): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return Object.fromEntries(Object.entries(value))
  throw new ApiError(0, `${itemName}响应格式不正确`)
}

function readArray(record: Record<string, unknown>, key: string, itemName: string): readonly unknown[] {
  const value = record[key]
  if (Array.isArray(value)) return value
  throw new ApiError(0, `${itemName}.${key} 响应格式不正确`)
}

function readString(record: Record<string, unknown>, key: string, itemName: string): string {
  return readDirectString(record[key], `${itemName}.${key}`)
}

function readDirectString(value: unknown, name: string): string {
  if (typeof value === "string") return value
  throw new ApiError(0, `${name} 响应格式不正确`)
}

function readNullableString(record: Record<string, unknown>, key: string, itemName: string): string | null {
  const value = record[key]
  if (value === null) return null
  return readDirectString(value, `${itemName}.${key}`)
}

function readBoolean(record: Record<string, unknown>, key: string, itemName: string): boolean {
  const value = record[key]
  if (typeof value === "boolean") return value
  throw new ApiError(0, `${itemName}.${key} 响应格式不正确`)
}

function readNumber(record: Record<string, unknown>, key: string, itemName: string): number {
  const value = record[key]
  if (typeof value === "number" && Number.isFinite(value)) return value
  throw new ApiError(0, `${itemName}.${key} 响应格式不正确`)
}
