import { BadRequestException } from "@nestjs/common"
import { DOMAIN_SCHEMA_VERSION, FAMILY_ENROLLMENT_AGREEMENT_VERSION } from "@linan/contracts"
import type { NewEnrollmentSubmission, NewFamilyMember, UpdateFamilyMember } from "./enrollment.types.js"
import { normalizeParticipantKind } from "./person-data.js"

type UnknownRecord = Record<string, unknown>

export function malformedEnrollmentInput(message: string): BadRequestException {
  return new BadRequestException({ code: "malformed_input", message })
}

export function parseFamilyMember(body: unknown): NewFamilyMember {
  const record = parseBody(body)
  const participantKind = normalizeParticipantKind(readOptionalString(record, "participantKind", 16))
  const schoolId = readOptionalString(record, "schoolId", 64)
  const gradeId = readOptionalString(record, "gradeId", 64)
  const classId = readOptionalString(record, "classId", 64)
  if (participantKind === "adult" && (schoolId !== undefined || gradeId !== undefined || classId !== undefined)) {
    throw malformedEnrollmentInput("adult participant must not submit schoolId, gradeId or classId")
  }
  return {
    code: readString(record, "code", 64),
    displayName: readPersonName(record, "displayName"),
    participantKind,
    schoolId: participantKind === "student" ? requireOptionalString(schoolId, "schoolId", 64) : undefined,
    gradeId: participantKind === "student" ? requireOptionalString(gradeId, "gradeId", 64) : undefined,
    classId: participantKind === "student" ? requireOptionalString(classId, "classId", 64) : undefined,
    tourSessionId: readOptionalString(record, "tourSessionId", 64),
    personData: parsePersonData(record),
    ...("saveAsCommon" in record ? { saveAsCommon: readBoolean(record, "saveAsCommon") } : {}),
  }
}

export function parseFamilyMemberPatch(body: unknown): UpdateFamilyMember {
  const record = parseBody(body)
  return {
    displayName: "displayName" in record ? readPersonName(record, "displayName") : undefined,
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
    contactName: readPersonName(record, "contactName"),
    ...("contactPhone" in record ? { contactPhone: readContactPhone(record) } : {}),
    emergencyContactName: readPersonName(record, "emergencyContactName"),
    emergencyContactPhone: readString(record, "emergencyContactPhone", 32),
    agreementVersion,
    schemaVersion,
    noticeVersionId: readString(record, "noticeVersionId", 64),
    noticeVersion: readString(record, "noticeVersion", 64),
  }
}

function readBoolean(body: UnknownRecord, field: string): boolean {
  const value = body[field]
  if (typeof value !== "boolean") throw malformedEnrollmentInput(`${field} must be a boolean`)
  return value
}

function readContactPhone(body: UnknownRecord): string {
  const phone = readString(body, "contactPhone", 32)
  if (!/^1[3-9]\d{9}$/.test(phone)) throw malformedEnrollmentInput("contactPhone must be a valid mainland China mobile number")
  return phone
}

function readPersonName(body: UnknownRecord, field: string): string {
  const name = readString(body, field, 120)
  if (!/^[\p{Script=Han}A-Za-z](?:[\p{Script=Han}A-Za-z ·•・\-'’]*[\p{Script=Han}A-Za-z])?$/u.test(name)) {
    throw malformedEnrollmentInput(`${field} 姓名只能填写中文汉字或英文字母，可在姓名中使用空格、中点、连字符或英文撇号`)
  }
  return name
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

function parsePersonData(body: UnknownRecord): NewFamilyMember["personData"] {
  const identityNumber = readOptionalString(body, "identityNumber", 18)
  const phone = readOptionalString(body, "phone", 32)
  if (identityNumber === undefined || phone === undefined) {
    throw malformedEnrollmentInput("identityNumber and phone must be submitted together")
  }
  return { identityNumber, phone }
}

function requireOptionalString(value: string | undefined, field: string, maxLength: number): string {
  if (value === undefined) {
    throw malformedEnrollmentInput(`${field} must be a non-empty string of at most ${maxLength} characters`)
  }
  return value
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
