import { ApiError } from "./api-error"
import { parseEnrollmentMember, parseOrder, readCollection, readIsoString, readNonNegativeInteger, readRecord, readString } from "./api-parsers"
import type { CatalogItem, OrderDetail, OrderHistoryItem, OrderParticipant, RefundHistoryItem, RefundSummary, SavedEnrollmentMember } from "./api-types"

function readParticipantKind(record: Record<string, unknown>): "student" | "adult" {
  const value = readString(record, "participantKind")
  if (value === "student" || value === "adult") return value
  throw new ApiError(0, "participantKind 响应格式不正确")
}

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
    ...parseEnrollmentMember(value), schoolId: readNullableText(record, "schoolId"),
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
    contactPhone: record["contactPhone"] === undefined ? null : readNullableText(record, "contactPhone"),
    emergencyContactName: readNullableText(record, "emergencyContactName"),
    emergencyContactPhone: readNullableText(record, "emergencyContactPhone"),
    participants: readCollection(record["participants"], parseOrderParticipant),
    refundSummary: parseRefundSummary(record["refundSummary"]),
    refundHistory: readCollection(record["refundHistory"], parseRefundHistoryItem),
  }
}

function parseOrderParticipant(value: unknown): OrderParticipant {
  const record = readRecord(value)
  return {
    id: readString(record, "id"), enrollmentParticipantId: readString(record, "enrollmentParticipantId"),
    familyMemberId: readString(record, "familyMemberId"),
    displayName: readString(record, "displayName"), participantKind: readParticipantKind(record),
    gradeName: readNullableText(record, "gradeName"),
    className: readNullableText(record, "className"), amountFen: readNonNegativeInteger(record, "amountFen"),
    refundedFen: readNonNegativeInteger(record, "refundedFen"),
    refundStatus: readParticipantRefundStatus(record),
  }
}

function readParticipantRefundStatus(record: Record<string, unknown>): OrderParticipant["refundStatus"] {
  const status = readString(record, "refundStatus")
  switch (status) {
    case "none": case "pending": case "refunded": case "failed": return status
    default: throw new ApiError(0, "refundStatus 响应格式不正确")
  }
}

function parseRefundSummary(value: unknown): RefundSummary {
  const record = readRecord(value)
  const status = readString(record, "status")
  switch (status) {
    case "none": case "partial": case "full":
      return { status, refundedFen: readNonNegativeInteger(record, "refundedFen"),
        pendingFen: readNonNegativeInteger(record, "pendingFen"), failedCount: readNonNegativeInteger(record, "failedCount") }
    default: throw new ApiError(0, "status 响应格式不正确")
  }
}

function parseRefundHistoryItem(value: unknown): RefundHistoryItem {
  const record = readRecord(value)
  const status = readString(record, "status")
  switch (status) {
    case "pending": case "succeeded": case "failed":
      return {
        id: readString(record, "id"), status, amountFen: readNonNegativeInteger(record, "amountFen"),
        requestedAt: readIsoString(record, "requestedAt"),
        processedAt: record["processedAt"] === null ? null : readIsoString(record, "processedAt"),
        lines: readCollection(record["lines"], (line) => {
          const item = readRecord(line)
          return { lineId: readString(item, "lineId"), displayName: readString(item, "displayName"), amountFen: readNonNegativeInteger(item, "amountFen") }
        }),
      }
    default: throw new ApiError(0, "status 响应格式不正确")
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
