import type { TourSessionStatus } from "@linan/contracts"
import { ApiError } from "./api-error"
import type {
  EnrollmentAvailability,
  EnrollmentMember,
  EnrollmentSubmission,
  Grade,
  School,
  SchoolClass,
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
    startsAt: readIsoString(record, "startsAt"),
    endsAt: readIsoString(record, "endsAt"),
    enrollmentOpensAt: readIsoString(record, "enrollmentOpensAt"),
    enrollmentClosesAt: readIsoString(record, "enrollmentClosesAt"),
    policyVersion: readString(record, "policyVersion"),
  }
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
  return {
    id: readString(record, "id"),
    code: readString(record, "code"),
    displayName: readString(record, "displayName"),
  }
}

export function readErrorMessage(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const message = value["message"]
  return typeof message === "string" ? message : undefined
}

function readRecord(value: unknown): UnknownRecord {
  if (isRecord(value)) {
    return value
  }

  throw new ApiError(0, "响应格式不正确")
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readString(record: UnknownRecord, field: string): string {
  const value = record[field]
  if (typeof value === "string" && value.length > 0) {
    return value
  }

  throw new ApiError(0, `${field} 响应格式不正确`)
}

function readIsoString(record: UnknownRecord, field: string): string {
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

function readTourSessionStatus(record: UnknownRecord): TourSessionStatus {
  const value = readString(record, "status")
  if (value === "draft" || value === "published" || value === "closed" || value === "cancelled") {
    return value
  }

  throw new ApiError(0, "status 响应格式不正确")
}
