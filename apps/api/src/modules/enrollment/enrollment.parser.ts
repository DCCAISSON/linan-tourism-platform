import { BadRequestException } from "@nestjs/common"
import { DOMAIN_SCHEMA_VERSION, FAMILY_ENROLLMENT_AGREEMENT_VERSION } from "@linan/contracts"
import type { NewEnrollmentSubmission, NewFamilyMember, UpdateFamilyMember } from "./enrollment.types.js"

type UnknownRecord = Record<string, unknown>

export function malformedEnrollmentInput(message: string): BadRequestException {
  return new BadRequestException({ code: "malformed_input", message })
}

export function parseFamilyMember(body: unknown): NewFamilyMember {
  const record = parseBody(body)
  return {
    code: readString(record, "code", 64),
    displayName: readString(record, "displayName", 120),
    schoolId: readString(record, "schoolId", 64),
    gradeId: readString(record, "gradeId", 64),
    classId: readString(record, "classId", 64),
  }
}

export function parseFamilyMemberPatch(body: unknown): UpdateFamilyMember {
  const record = parseBody(body)
  return {
    displayName: readOptionalString(record, "displayName", 120),
    gradeId: readOptionalString(record, "gradeId", 64),
    classId: readOptionalString(record, "classId", 64),
  }
}

export function parseEnrollmentSubmission(body: unknown): NewEnrollmentSubmission {
  const record = parseBody(body)
  const memberIds = readStringArray(record, "memberIds")
  if (new Set(memberIds).size !== memberIds.length) {
    throw malformedEnrollmentInput("memberIds must not contain duplicates")
  }

  const schemaVersion = readString(record, "schemaVersion", 64)
  if (schemaVersion !== DOMAIN_SCHEMA_VERSION) {
    throw malformedEnrollmentInput("schemaVersion must match the current domain schema")
  }

  const agreementVersion = readString(record, "agreementVersion", 64)
  if (agreementVersion !== FAMILY_ENROLLMENT_AGREEMENT_VERSION) {
    throw malformedEnrollmentInput("agreementVersion must match the current enrollment agreement")
  }

  return {
    tourSessionId: readString(record, "tourSessionId", 64),
    memberIds,
    contactName: readString(record, "contactName", 120),
    emergencyContactName: readString(record, "emergencyContactName", 120),
    emergencyContactPhone: readString(record, "emergencyContactPhone", 32),
    agreementVersion,
    schemaVersion,
  }
}

function parseBody(body: unknown): UnknownRecord {
  if (!isRecord(body)) {
    throw malformedEnrollmentInput("request body must be an object")
  }
  return body
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readString(body: UnknownRecord, field: string, maxLength: number): string {
  const value = body[field]
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw malformedEnrollmentInput(`${field} must be a non-empty string of at most ${maxLength} characters`)
  }
  return value.trim()
}

function readOptionalString(body: UnknownRecord, field: string, maxLength: number): string | undefined {
  if (!(field in body)) {
    return undefined
  }
  return readString(body, field, maxLength)
}

function readStringArray(body: UnknownRecord, field: string): readonly string[] {
  const value = body[field]
  if (!Array.isArray(value) || value.length === 0) {
    throw malformedEnrollmentInput(`${field} must be a non-empty string array`)
  }
  const strings: string[] = []
  for (const item of value) {
    if (typeof item !== "string" || item.trim().length === 0 || item.length > 64) {
      throw malformedEnrollmentInput(`${field} must be a non-empty string array`)
    }
    strings.push(item.trim())
  }
  return strings
}
