import { ApiError } from "./api-error"
import { parseEnrollmentMember, parseOrder, readCollection, readIsoString, readNonNegativeInteger, readRecord, readString } from "./api-parsers"
import type { CatalogItem, OrderDetail, OrderHistoryItem, OrderParticipant, SavedEnrollmentMember } from "./api-types"

export function parseCatalogItem(value: unknown): CatalogItem {
  const record = readRecord(value)
  const status = readString(record, "status")
  return {
    id: readString(record, "id"), organizationId: readString(record, "organizationId"),
    code: readString(record, "code"), title: readString(record, "title"), status,
    policyVersion: readString(record, "policyVersion"),
    description: readText(record, "description"), coverImageUrl: readText(record, "coverImageUrl"),
  }
}

export function parseSavedEnrollmentMember(value: unknown): SavedEnrollmentMember {
  const record = readRecord(value)
  return {
    ...parseEnrollmentMember(value), schoolId: readString(record, "schoolId"),
    gradeId: readNullableText(record, "gradeId"), classId: readNullableText(record, "classId"),
  }
}

export function parseOrderHistoryItem(value: unknown): OrderHistoryItem {
  const record = readRecord(value)
  return {
    ...parseOrder(value), tourSessionId: readString(record, "tourSessionId"),
    activityTitle: readString(record, "activityTitle"), schoolName: readString(record, "schoolName"),
    startsAt: readIsoString(record, "startsAt"), endsAt: readIsoString(record, "endsAt"),
    createdAt: readIsoString(record, "createdAt"),
  }
}

export function parseOrderDetail(value: unknown): OrderDetail {
  const record = readRecord(value)
  return {
    ...parseOrderHistoryItem(value), contactName: readString(record, "contactName"),
    emergencyContactName: readNullableText(record, "emergencyContactName"),
    emergencyContactPhone: readNullableText(record, "emergencyContactPhone"),
    participants: readCollection(record["participants"], parseOrderParticipant),
  }
}

function parseOrderParticipant(value: unknown): OrderParticipant {
  const record = readRecord(value)
  return {
    id: readString(record, "id"), enrollmentParticipantId: readString(record, "enrollmentParticipantId"),
    displayName: readString(record, "displayName"), gradeName: readNullableText(record, "gradeName"),
    className: readNullableText(record, "className"), amountFen: readNonNegativeInteger(record, "amountFen"),
  }
}

function readText(record: Record<string, unknown>, field: string): string {
  const value = record[field]
  if (typeof value === "string") return value
  throw new ApiError(0, `${field} 响应格式不正确`)
}

function readNullableText(record: Record<string, unknown>, field: string): string | null {
  if (record[field] === null) return null
  return readText(record, field)
}
