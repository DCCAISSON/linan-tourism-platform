import { BadRequestException } from "@nestjs/common"
import { TOUR_SESSION_STATUS, type TourSessionStatus } from "@linan/contracts"
import type {
  NewCatalogItem,
  NewClass,
  NewGrade,
  NewSchool,
  NewNoticeVersion,
  NewTourSession,
  UpdateCatalogItem,
  UpdateClass,
  UpdateGrade,
  UpdateSchool,
  UpdateTourSession,
} from "./configuration.types.js"

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readString(body: UnknownRecord, field: string): string {
  const value = body[field]
  if (typeof value !== "string" || value.length === 0) {
    throw malformedInput(`${field} must be a non-empty string`)
  }

  return value
}

function readOptionalString(body: UnknownRecord, field: string): string | undefined {
  if (!(field in body)) {
    return undefined
  }

  return readString(body, field)
}

function readCatalogContent(body: UnknownRecord, field: "description" | "coverImageUrl"): string | undefined {
  if (!(field in body)) return undefined
  const value = body[field]
  const limit = field === "description" ? 4000 : 2048
  if (typeof value !== "string" || value.length > limit) {
    throw malformedInput(`${field} must be a string of at most ${limit} characters`)
  }
  if (field === "coverImageUrl" && value !== "") {
    let url: URL
    try {
      url = new URL(value)
    } catch (error) {
      if (error instanceof TypeError) throw malformedInput("coverImageUrl must be a valid HTTPS URL")
      throw error
    }
    if (url.protocol !== "https:") throw malformedInput("coverImageUrl must be a valid HTTPS URL")
  }
  return value
}

function readInteger(body: UnknownRecord, field: string): number {
  const value = body[field]
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw malformedInput(`${field} must be an integer`)
  }

  return value
}

function readOptionalInteger(body: UnknownRecord, field: string): number | undefined {
  if (!(field in body)) {
    return undefined
  }

  return readInteger(body, field)
}

function readTourSessionStatus(body: UnknownRecord): TourSessionStatus {
  const value = readString(body, "status")
  if (
    value === TOUR_SESSION_STATUS.draft ||
    value === TOUR_SESSION_STATUS.published ||
    value === TOUR_SESSION_STATUS.closed ||
    value === TOUR_SESSION_STATUS.cancelled
  ) {
    return value
  }

  throw malformedInput("status must be a tour session status")
}

function readOptionalTourSessionStatus(body: UnknownRecord): TourSessionStatus | undefined {
  if (!("status" in body)) {
    return undefined
  }

  return readTourSessionStatus(body)
}

function readDate(body: UnknownRecord, field: string): Date {
  const value = readString(body, field)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw malformedInput(`${field} must be an ISO date`)
  }

  return date
}

function readOptionalDate(body: UnknownRecord, field: string): Date | undefined {
  if (!(field in body)) {
    return undefined
  }

  return readDate(body, field)
}

function parseBody(body: unknown): UnknownRecord {
  if (!isRecord(body)) {
    throw malformedInput("request body must be an object")
  }

  return body
}

export function malformedInput(message: string): BadRequestException {
  return new BadRequestException({
    code: "malformed_input",
    message,
  })
}

export function parseSchool(body: unknown): NewSchool {
  const record = parseBody(body)
  return {
    code: readString(record, "code"),
    name: readString(record, "name"),
  }
}

export function parseGrade(body: unknown, schoolId: string): NewGrade {
  const record = parseBody(body)
  return {
    organizationId: schoolId,
    code: readString(record, "code"),
    name: readString(record, "name"),
  }
}

export function parseClass(body: unknown, gradeId: string): NewClass {
  const record = parseBody(body)
  return {
    gradeId,
    code: readString(record, "code"),
    name: readString(record, "name"),
  }
}

export function parseCatalogItem(body: unknown): NewCatalogItem {
  const record = parseBody(body)
  return {
    organizationId: readString(record, "organizationId"),
    code: readString(record, "code"),
    title: readString(record, "title"),
    description: readCatalogContent(record, "description") ?? "",
    coverImageUrl: readCatalogContent(record, "coverImageUrl") ?? "",
    status: readString(record, "status"),
  }
}

export function parseTourSession(body: unknown): NewTourSession {
  const record = parseBody(body)
  const priceFen = readInteger(record, "priceFen")
  const startsAt = readDate(record, "startsAt")
  const endsAt = readDate(record, "endsAt")
  const enrollmentOpensAt = readDate(record, "enrollmentOpensAt")
  const enrollmentClosesAt = readDate(record, "enrollmentClosesAt")

  if (priceFen < 0) {
    throw malformedInput("priceFen must be a non-negative integer number of fen")
  }

  if (endsAt.getTime() < startsAt.getTime()) {
    throw malformedInput("endsAt must not be earlier than startsAt")
  }

  if (enrollmentClosesAt.getTime() < enrollmentOpensAt.getTime()) {
    throw malformedInput("enrollmentClosesAt must not be earlier than enrollmentOpensAt")
  }

  return {
    organizationId: readString(record, "organizationId"),
    catalogItemId: readString(record, "catalogItemId"),
    code: readString(record, "code"),
    status: readTourSessionStatus(record),
    priceFen,
    capacity: readInteger(record, "capacity"),
    startsAt,
    endsAt,
    enrollmentOpensAt,
    enrollmentClosesAt,
  }
}

export function parseAvailabilityTime(at: string | undefined): Date {
  if (at === undefined || at.length === 0) {
    throw malformedInput("at must be an ISO date")
  }

  const date = new Date(at)
  if (Number.isNaN(date.getTime())) {
    throw malformedInput("at must be an ISO date")
  }

  return date
}

export function parseSchoolPatch(body: unknown): UpdateSchool {
  const record = parseBody(body)
  return {
    code: readOptionalString(record, "code"),
    name: readOptionalString(record, "name"),
  }
}

export function parseGradePatch(body: unknown): UpdateGrade {
  const record = parseBody(body)
  return {
    code: readOptionalString(record, "code"),
    name: readOptionalString(record, "name"),
  }
}

export function parseClassPatch(body: unknown): UpdateClass {
  const record = parseBody(body)
  return {
    code: readOptionalString(record, "code"),
    name: readOptionalString(record, "name"),
  }
}

export function parseCatalogItemPatch(body: unknown): UpdateCatalogItem {
  const record = parseBody(body)
  return {
    code: readOptionalString(record, "code"),
    title: readOptionalString(record, "title"),
    description: readCatalogContent(record, "description"),
    coverImageUrl: readCatalogContent(record, "coverImageUrl"),
    status: readOptionalString(record, "status"),
  }
}

export function parseTourSessionPatch(body: unknown): UpdateTourSession {
  const record = parseBody(body)
  const priceFen = readOptionalInteger(record, "priceFen")
  if (priceFen !== undefined && priceFen < 0) {
    throw malformedInput("priceFen must be a non-negative integer number of fen")
  }

  return {
    catalogItemId: readOptionalString(record, "catalogItemId"),
    code: readOptionalString(record, "code"),
    status: readOptionalTourSessionStatus(record),
    priceFen,
    capacity: readOptionalInteger(record, "capacity"),
    startsAt: readOptionalDate(record, "startsAt"),
    endsAt: readOptionalDate(record, "endsAt"),
    enrollmentOpensAt: readOptionalDate(record, "enrollmentOpensAt"),
    enrollmentClosesAt: readOptionalDate(record, "enrollmentClosesAt"),
  }
}


export function parseNoticeVersion(body: unknown): NewNoticeVersion {
  const record = parseBody(body)
  const title = readString(record, "title")
  const version = readString(record, "version")
  const content = readNoticeContent(record["contentJson"])
  return { version, title, contentJson: content }
}

function readNoticeContent(value: unknown): NewNoticeVersion["contentJson"] {
  if (!isRecord(value)) {
    throw malformedInput("contentJson must be an object")
  }
  const content = {
    destination: readString(value, "destination"),
    departurePlace: readString(value, "departurePlace"),
    mealNote: readString(value, "mealNote"),
    itinerary: readStringList(value, "itinerary"),
    unitPrices: readStringList(value, "unitPrices"),
    packageExamples: readStringList(value, "packageExamples"),
    reminders: readStringList(value, "reminders"),
  }
  if (content.itinerary.length !== 7) {
    throw malformedInput("itinerary must contain exactly seven items")
  }
  return content
}

function readStringList(record: UnknownRecord, field: string): readonly string[] {
  const value = record[field]
  if (!Array.isArray(value) || value.length === 0) {
    throw malformedInput(`${field} must be a non-empty string array`)
  }
  return value.map((item) => {
    if (typeof item !== "string" || item.trim().length === 0 || item.length > 400) {
      throw malformedInput(`${field} must be a non-empty string array`)
    }
    return item.trim()
  })
}
