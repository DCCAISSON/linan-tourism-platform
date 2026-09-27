import type { OrderStatus, PaymentStatus, TourSessionStatus } from "@linan/contracts"
import { ApiError } from "./api-error"
import type {
  EnrollmentAvailability,
  EnrollmentMember,
  EnrollmentSubmission,
  Grade,
  MockPayment,
  Order,
  School,
  SchoolClass,
  NoticeContent,
  NoticeVersion,
  TourSession,
} from "./api-types"

type UnknownRecord = Record<string, unknown>

export function readCollection<T>(value: unknown, parse: (item: unknown) => T): readonly T[] {
  if (!Array.isArray(value)) {
    throw new ApiError(0, "列表响应格式不正确")
  }

  return value.map(parse)
}

export function parseSchool(value: unknown): School {
  const record = readRecord(value)
  return {
    id: readString(record, "id"),
    code: readString(record, "code"),
    name: readString(record, "name"),
  }
}

export function parseGrade(value: unknown): Grade {
  const record = readRecord(value)
  return {
    id: readString(record, "id"),
    organizationId: readString(record, "organizationId"),
    code: readString(record, "code"),
    name: readString(record, "name"),
  }
}

export function parseSchoolClass(value: unknown): SchoolClass {
  const record = readRecord(value)
  return {
    id: readString(record, "id"),
    gradeId: readString(record, "gradeId"),
    code: readString(record, "code"),
    name: readString(record, "name"),
  }
}

export function parseTourSession(value: unknown): TourSession {
  const record = readRecord(value)
  return {
    id: readString(record, "id"),
    organizationId: readString(record, "organizationId"),
    catalogItemId: readString(record, "catalogItemId"),
    code: readString(record, "code"),
    status: readTourSessionStatus(record),
    priceFen: readNumber(record, "priceFen"),
    capacity: readNumber(record, "capacity"),
    minimumParticipants: readOptionalCount(record, "minimumParticipants"),
    occupiedCapacity: readOptionalCount(record, "occupiedCapacity"),
    startsAt: readIsoString(record, "startsAt"),
    endsAt: readIsoString(record, "endsAt"),
    enrollmentOpensAt: readIsoString(record, "enrollmentOpensAt"),
    enrollmentClosesAt: readIsoString(record, "enrollmentClosesAt"),
    activeNoticeId: readOptionalNullableString(record, "activeNoticeId") ?? null,
    activeNotice: parseNullableNoticeVersion(record["activeNotice"]),
    policyVersion: readString(record, "policyVersion"),
  }
}

function readOptionalCount(record: UnknownRecord, key: "minimumParticipants" | "occupiedCapacity"): number | null {
  const value = record[key]
  if (value === undefined || value === null) return null
  const minimum = key === "minimumParticipants" ? 1 : 0
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum
    || (key === "minimumParticipants" && value > readNumber(record, "capacity"))) {
    throw new ApiError(0, "团期人数响应格式不正确")
  }
  return value
}

function parseNullableNoticeVersion(value: unknown): NoticeVersion | null {
  if (value === null || value === undefined) {
    return null
  }
  const record = readRecord(value)
  return {
    id: readString(record, "id"),
    organizationId: readString(record, "organizationId"),
    tourSessionId: readString(record, "tourSessionId"),
    version: readString(record, "version"),
    title: readString(record, "title"),
    contentJson: parseNoticeContent(record["contentJson"]),
    createdAt: readIsoString(record, "createdAt"),
  }
}

function parseNoticeContent(value: unknown): NoticeContent {
  const record = readRecord(value)
  return {
    destination: readString(record, "destination"),
    departurePlace: readString(record, "departurePlace"),
    mealNote: readString(record, "mealNote"),
    itinerary: readStringList(record, "itinerary"),
    unitPrices: readStringList(record, "unitPrices"),
    packageExamples: readStringList(record, "packageExamples"),
    reminders: readStringList(record, "reminders"),
  }
}

function readStringList(record: UnknownRecord, field: string): readonly string[] {
  const value = record[field]
  if (!Array.isArray(value)) {
    throw new ApiError(0, `${field} 响应格式不正确`)
  }
  return value.map((item) => {
    if (typeof item !== "string" || item.length === 0) {
      throw new ApiError(0, `${field} 响应格式不正确`)
    }
    return item
  })
}

export function parseEnrollmentAvailability(value: unknown): EnrollmentAvailability {
  const record = readRecord(value)
  const available = record["available"]
  if (available !== true) {
    throw new ApiError(0, "报名可用性响应格式不正确")
  }

  return {
    available,
    tourSessionId: readString(record, "tourSessionId"),
    at: readIsoString(record, "at"),
  }
}

export function parseEnrollmentSubmission(value: unknown): EnrollmentSubmission {
  const record = readRecord(value)
  return {
    id: readString(record, "id"),
    status: readString(record, "status"),
  }
}

export function parseEnrollmentMember(value: unknown): EnrollmentMember {
  const record = readRecord(value)
  const participantKind = readOptionalParticipantKind(record)
  const identityNumberMasked = readOptionalNullableString(record, "identityNumberMasked")
  const phoneMasked = readOptionalNullableString(record, "phoneMasked")
  return {
    id: readString(record, "id"),
    code: readString(record, "code"),
    displayName: readString(record, "displayName"),
    ...(participantKind !== undefined ? { participantKind } : {}),
    ...(identityNumberMasked !== undefined ? { identityNumberMasked } : {}),
    ...(phoneMasked !== undefined ? { phoneMasked } : {}),
  }
}

export function parseOrder(value: unknown): Order {
  const record = readRecord(value)
  return {
    id: readString(record, "id"),
    code: readString(record, "code"),
    enrollmentId: readString(record, "enrollmentId"),
    status: readOrderStatus(record),
    amountFen: readNonNegativeInteger(record, "amountFen"),
    paidFen: readNonNegativeInteger(record, "paidFen"),
    payerName: readString(record, "payerName"),
    participantCount: readPositiveInteger(record, "participantCount"),
  }
}

export function parseMockPayment(value: unknown): MockPayment {
  const record = readRecord(value)
  const provider = readString(record, "provider")
  if (provider !== "local_mock") {
    throw new ApiError(0, "provider 响应格式不正确")
  }

  return {
    id: readString(record, "id"),
    orderId: readString(record, "orderId"),
    paymentNo: readString(record, "paymentNo"),
    provider,
    status: readPaymentStatus(record),
    amountFen: readNonNegativeInteger(record, "amountFen"),
  }
}

export function readErrorMessage(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const message = value["message"]
  return typeof message === "string" ? message : undefined
}

export function readRecord(value: unknown): UnknownRecord {
  if (isRecord(value)) {
    return value
  }

  throw new ApiError(0, "响应格式不正确")
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function readString(record: UnknownRecord, field: string): string {
  const value = record[field]
  if (typeof value === "string" && value.length > 0) {
    return value
  }

      throw new ApiError(0, `${field} 响应格式不正确`)
}

function readOptionalNullableString(record: UnknownRecord, field: string): string | null | undefined {
  const value = record[field]
  if (value === undefined) {
    return undefined
  }
  if (value === null) {
    return null
  }
  if (typeof value === "string") {
    return value
  }

      throw new ApiError(0, `${field} 响应格式不正确`)
}

function readOptionalParticipantKind(record: UnknownRecord): "student" | "adult" | undefined {
  const value = record["participantKind"]
  if (value === undefined) {
    return undefined
  }
  if (value === "student" || value === "adult") {
    return value
  }

  throw new ApiError(0, "participantKind 响应格式不正确")
}

export function readIsoString(record: UnknownRecord, field: string): string {
  const value = readString(record, field)
  if (!Number.isNaN(new Date(value).getTime())) {
    return value
  }

      throw new ApiError(0, `${field} 响应格式不正确`)
}

function readNumber(record: UnknownRecord, field: string): number {
  const value = record[field]
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

      throw new ApiError(0, `${field} 响应格式不正确`)
}

export function readNonNegativeInteger(record: UnknownRecord, field: string): number {
  const value = record[field]
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value
  }

      throw new ApiError(0, `${field} 响应格式不正确`)
}

function readPositiveInteger(record: UnknownRecord, field: string): number {
  const value = readNonNegativeInteger(record, field)
  if (value > 0) {
    return value
  }

      throw new ApiError(0, `${field} 响应格式不正确`)
}

function readTourSessionStatus(record: UnknownRecord): TourSessionStatus {
  const value = readString(record, "status")
  if (value === "draft" || value === "published" || value === "closed" || value === "cancelled") {
    return value
  }

  throw new ApiError(0, "status 响应格式不正确")
}

function readOrderStatus(record: UnknownRecord): OrderStatus {
  const value = readString(record, "status")
  if (value === "pending_payment" || value === "paid" || value === "cancelled" || value === "refunded") {
    return value
  }

  throw new ApiError(0, "status 响应格式不正确")
}

function readPaymentStatus(record: UnknownRecord): PaymentStatus {
  const value = readString(record, "status")
  if (value === "pending" || value === "succeeded" || value === "failed" || value === "refunded") {
    return value
  }

  throw new ApiError(0, "status 响应格式不正确")
}
