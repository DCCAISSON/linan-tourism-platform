import { ApiError } from "./configuration.errors"
import type { PretripAdjustment, PretripAttachment, PretripConfig, SchoolPretripConfirmation } from "./pretrip.types"

export function parsePretripConfig(value: unknown): PretripConfig {
  const record = readRecord(value, "pretrip config")
  return {
    tourSessionId: readString(record, "tourSessionId", "pretrip config"),
    gatheringAt: readNullableString(record, "gatheringAt", "pretrip config"),
    gatheringPlace: readString(record, "gatheringPlace", "pretrip config"),
    travelMode: readTravelMode(record, "travelMode"),
    itineraryNote: readString(record, "itineraryNote", "pretrip config"),
    contactName: readString(record, "contactName", "pretrip config"),
    contactPhone: readString(record, "contactPhone", "pretrip config"),
    serviceContact: readString(record, "serviceContact", "pretrip config"),
    noticeVersionId: readNullableString(record, "noticeVersionId", "pretrip config"),
    version: readNumber(record, "version", "pretrip config"),
    attachments: readArray(record, "attachments", "pretrip config").map(parseAttachment),
  }
}

export function parseSchoolConfirmations(value: unknown): readonly SchoolPretripConfirmation[] {
  if (!Array.isArray(value)) throw invalid("school confirmations")
  return value.map(parseSchoolConfirmation)
}

export function parseSchoolConfirmation(value: unknown): SchoolPretripConfirmation {
  const record = readRecord(value, "school confirmation")
  const status = record["status"]
  if (status !== "current" && status !== "superseded" && status !== "stale") throw invalid("school confirmation.status")
  return {
    id: readString(record, "id", "school confirmation"),
    tourSessionId: readString(record, "tourSessionId", "school confirmation"),
    schoolId: readString(record, "schoolId", "school confirmation"),
    transportConfirmationId: readString(record, "transportConfirmationId", "school confirmation"),
    planVersion: readNumber(record, "planVersion", "school confirmation"),
    rosterVersion: readString(record, "rosterVersion", "school confirmation"),
    status,
    signedAt: readString(record, "signedAt", "school confirmation"),
    signedByStaffId: readString(record, "signedByStaffId", "school confirmation"),
  }
}

export function parsePretripAdjustment(value: unknown): PretripAdjustment {
  const record = readRecord(value, "pretrip adjustment")
  const kind = record["kind"]
  const status = record["status"]
  if (kind !== "vehicle_change" && kind !== "profile_correction") throw invalid("pretrip adjustment.kind")
  if (status !== "submitted" && status !== "accepted" && status !== "rejected") throw invalid("pretrip adjustment.status")
  return {
    id: readString(record, "id", "pretrip adjustment"),
    tourSessionId: readString(record, "tourSessionId", "pretrip adjustment"),
    schoolId: readString(record, "schoolId", "pretrip adjustment"),
    transportConfirmationId: readString(record, "transportConfirmationId", "pretrip adjustment"),
    planVersion: readNumber(record, "planVersion", "pretrip adjustment"),
    rosterVersion: readString(record, "rosterVersion", "pretrip adjustment"),
    kind,
    personRef: readNullableString(record, "personRef", "pretrip adjustment"),
    requestText: readString(record, "requestText", "pretrip adjustment"),
    status,
    responseText: readNullableString(record, "responseText", "pretrip adjustment"),
    createdAt: readString(record, "createdAt", "pretrip adjustment"),
    updatedAt: readString(record, "updatedAt", "pretrip adjustment"),
  }
}

function parseAttachment(value: unknown): PretripAttachment {
  const record = readRecord(value, "pretrip attachment")
  return {
    id: readString(record, "id", "pretrip attachment"),
    title: readString(record, "title", "pretrip attachment"),
    contentType: readString(record, "contentType", "pretrip attachment"),
    byteSize: readNumber(record, "byteSize", "pretrip attachment"),
  }
}

function readRecord(value: unknown, itemName: string): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return Object.fromEntries(Object.entries(value))
  throw invalid(itemName)
}

function readArray(record: Record<string, unknown>, key: string, itemName: string): readonly unknown[] {
  const value = record[key]
  if (Array.isArray(value)) return value
  throw invalid(`${itemName}.${key}`)
}

function readString(record: Record<string, unknown>, key: string, itemName: string): string {
  const value = record[key]
  if (typeof value === "string") return value
  throw invalid(`${itemName}.${key}`)
}

function readNullableString(record: Record<string, unknown>, key: string, itemName: string): string | null {
  const value = record[key]
  if (value === null) return null
  if (typeof value === "string") return value
  throw invalid(`${itemName}.${key}`)
}

function readNumber(record: Record<string, unknown>, key: string, itemName: string): number {
  const value = record[key]
  if (typeof value === "number" && Number.isFinite(value)) return value
  throw invalid(`${itemName}.${key}`)
}

function readTravelMode(record: Record<string, unknown>, key: string): PretripConfig["travelMode"] {
  const value = record[key]
  if (value === "group" || value === "self" || value === "mixed") return value
  throw invalid(`pretrip config.${key}`)
}

function invalid(field: string): ApiError {
  return new ApiError(0, `${field} response format is invalid`)
}
