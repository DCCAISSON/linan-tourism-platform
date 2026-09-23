import { BadRequestException } from "@nestjs/common"
import type { PersonRef } from "../travelers/travelers.types.js"
import type {
  BatchEvaluationInput,
  EvaluationGradeCode,
  EvaluationObservationInput,
  EvaluationRevisionInput,
  EvaluationStandardInput,
  StandardConfirmationInput,
  StandardItemInput,
} from "./evaluations.types.js"

export function parseEvaluationStandard(body: unknown): EvaluationStandardInput {
  const record = inputRecord(body, ["tourSessionId", "title", "items", "publicFormatNote"])
  const items = readItems(record["items"])
  const codes = new Set(items.map((item) => item.code))
  if (!codes.has("A") || !codes.has("B")) throw invalid("confirmed standard requires explicit A/B labels")
  return {
    tourSessionId: readId(record, "tourSessionId"),
    title: readText(record, "title", 120),
    items,
    publicFormatNote: readText(record, "publicFormatNote", 160),
  }
}

export function parseStandardConfirmation(body: unknown): StandardConfirmationInput {
  const record = inputRecord(body, ["expectedVersion", "confirmed"])
  if (record["confirmed"] !== true) throw invalid("standard confirmation must be explicit")
  return { expectedVersion: readVersion(record), confirmed: true }
}

export function parseBatchEvaluation(body: unknown): BatchEvaluationInput {
  const record = inputRecord(body, ["tourSessionId", "standardId", "observations", "idempotencyKey"])
  const standardId = readNullableId(record["standardId"], "standardId")
  const observations = readObservations(record["observations"])
  if (standardId === null && observations.some((item) => item.gradeCode !== null)) {
    throw invalid("confirmed standard is required before A/B grades can be recorded")
  }
  return {
    tourSessionId: readId(record, "tourSessionId"),
    standardId,
    observations,
    idempotencyKey: readId(record, "idempotencyKey"),
  }
}

export function parseEvaluationRevision(body: unknown): EvaluationRevisionInput {
  const record = inputRecord(body, ["expectedVersion", "internalComment", "excellent", "attention", "gradeCode"])
  return {
    expectedVersion: readVersion(record),
    internalComment: readText(record, "internalComment", 500, true),
    excellent: readBoolean(record, "excellent"),
    attention: readBoolean(record, "attention"),
    gradeCode: readGrade(record["gradeCode"], true),
  }
}

function readItems(value: unknown): readonly StandardItemInput[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 8) throw invalid("standard items must include A/B")
  const seen = new Set<EvaluationGradeCode>()
  return value.map((item) => {
    const record = inputRecord(item, ["code", "label", "description"])
    const code = readGrade(record["code"], false)
    if (seen.has(code)) throw invalid("standard item codes must be unique")
    seen.add(code)
    return { code, label: readText(record, "label", 80), description: readText(record, "description", 300) }
  })
}

function readObservations(value: unknown): readonly EvaluationObservationInput[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 200) throw invalid("evaluation observations are required")
  const refs = new Set<PersonRef>()
  return value.map((item) => {
    const record = inputRecord(item, ["personRef", "internalComment", "excellent", "attention", "gradeCode"])
    const personRef = readPersonRef(record["personRef"])
    if (refs.has(personRef)) throw invalid("duplicate personRef in evaluation batch")
    refs.add(personRef)
    return {
      personRef,
      internalComment: readText(record, "internalComment", 500, true),
      excellent: readBoolean(record, "excellent"),
      attention: readBoolean(record, "attention"),
      gradeCode: readGrade(record["gradeCode"], true),
    }
  })
}

function inputRecord(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalid("request body must be an object")
  const record = Object.fromEntries(Object.entries(value))
  if (Object.keys(record).some((key) => !allowed.includes(key))) throw invalid("request body contains unsupported fields")
  return record
}

function readId(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value === "string" && /^[\w:-]{1,80}$/.test(value)) return value
  throw invalid(`${key} is invalid`)
}

function readNullableId(value: unknown, key: string): string | null {
  if (value === null) return null
  if (typeof value === "string" && /^[\w:-]{1,80}$/.test(value)) return value
  throw invalid(`${key} is invalid`)
}

function readPersonRef(value: unknown): PersonRef {
  if (typeof value === "string" && isPersonRef(value)) return value
  throw invalid("personRef is invalid")
}

function isPersonRef(value: string): value is PersonRef {
  return /^(paid|imported):[\w-]{1,64}$/.test(value)
}

function readGrade(value: unknown, nullable: true): EvaluationGradeCode | null
function readGrade(value: unknown, nullable: false): EvaluationGradeCode
function readGrade(value: unknown, nullable: boolean): EvaluationGradeCode | null {
  if (value === null && nullable) return null
  if (value === "A" || value === "B") return value
  throw invalid("gradeCode must be A or B")
}

function readText(record: Record<string, unknown>, key: string, maxLength: number, optional = false): string {
  const value = record[key]
  if (typeof value !== "string" || value.length > maxLength || hasBlockedTextChar(value)) throw invalid(`${key} content is invalid`)
  const trimmed = value.trim()
  if (!optional && trimmed.length === 0) throw invalid(`${key} is required`)
  return trimmed
}

function hasBlockedTextChar(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0)
    if (code < 32 || char === "<" || char === ">") return true
  }
  return false
}

function readBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key]
  if (typeof value === "boolean") return value
  throw invalid(`${key} must be boolean`)
}

function readVersion(record: Record<string, unknown>): number {
  const value = record["expectedVersion"]
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value
  throw invalid("expectedVersion is invalid")
}

function invalid(message: string): BadRequestException {
  return new BadRequestException({ code: "evaluation_input_invalid", message })
}
