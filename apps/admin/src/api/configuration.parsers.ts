import { ApiError } from "./configuration.errors"
import type { CatalogItem, Grade, School, SchoolClass, TourSession } from "./configuration.types"

export function parseSchool(value: unknown): School {
  const record = readRecord(value, "学校")

  return {
    id: readString(record, "id"),
    name: readString(record, "name"),
    code: readString(record, "code"),
  }
}

export function parseGrade(value: unknown): Grade {
  const record = readRecord(value, "年级")

  return {
    id: readString(record, "id"),
    organizationId: readString(record, "organizationId"),
    schoolId: readString(record, "organizationId"),
    name: readString(record, "name"),
    code: readString(record, "code"),
    status: readString(record, "status", "active"),
  }
}

export function parseClass(value: unknown): SchoolClass {
  const record = readRecord(value, "班级")

  return {
    id: readString(record, "id"),
    gradeId: readString(record, "gradeId"),
    name: readString(record, "name"),
    code: readString(record, "code"),
    status: readString(record, "status", "active"),
  }
}

export function parseCatalogItem(value: unknown): CatalogItem {
  const record = readRecord(value, "课程")

  return {
    id: readString(record, "id"),
    organizationId: readString(record, "organizationId"),
    code: readString(record, "code"),
    title: readString(record, "title"),
    description: readString(record, "description"),
    coverImageUrl: readString(record, "coverImageUrl"),
    status: readString(record, "status", "active"),
    policyVersion: readString(record, "policyVersion"),
  }
}

export function parseTourSession(value: unknown): TourSession {
  const record = readRecord(value, "团期")

  return {
    id: readString(record, "id"),
    organizationId: readString(record, "organizationId"),
    catalogItemId: readString(record, "catalogItemId"),
    code: readString(record, "code"),
    startsAt: readString(record, "startsAt"),
    endsAt: readString(record, "endsAt"),
    enrollmentOpensAt: readString(record, "enrollmentOpensAt"),
    enrollmentClosesAt: readString(record, "enrollmentClosesAt"),
    status: readString(record, "status", "draft"),
    priceFen: readNumber(record, "priceFen"),
    capacity: readNumber(record, "capacity"),
    policyVersion: readString(record, "policyVersion"),
  }
}

function readRecord(value: unknown, itemName: string): Record<string, unknown> {
  if (isRecord(value)) {
    return value
  }

  throw new ApiError(0, `${itemName}响应格式不正确`)
}

function readString(record: Record<string, unknown>, key: string, fallback = ""): string {
  const value = record[key]
  return typeof value === "string" ? value : fallback
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
