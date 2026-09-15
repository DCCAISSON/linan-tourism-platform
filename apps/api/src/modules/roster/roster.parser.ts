import { malformedRosterInput } from "./roster.errors.js"
import type { RosterFilters } from "./roster.types.js"

type QueryRecord = Record<string, unknown>

export function parseRosterFilters(query: unknown): RosterFilters {
  const record = parseQuery(query)
  return {
    tourSessionId: readRequiredString(record, "tourSessionId"),
    schoolId: readOptionalString(record, "schoolId"),
    gradeId: readOptionalString(record, "gradeId"),
    classId: readOptionalString(record, "classId"),
  }
}

function parseQuery(query: unknown): QueryRecord {
  if (!isQueryRecord(query)) {
    throw malformedRosterInput("query must be an object")
  }
  return query
}

function isQueryRecord(value: unknown): value is QueryRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readRequiredString(query: QueryRecord, field: string): string {
  const value = readOptionalString(query, field)
  if (value === null) {
    throw malformedRosterInput(`${field} must be a non-empty string of at most 64 characters`)
  }
  return value
}

function readOptionalString(query: QueryRecord, field: string): string | null {
  const value = query[field]
  if (value === undefined) {
    return null
  }
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 64) {
    throw malformedRosterInput(`${field} must be a non-empty string of at most 64 characters`)
  }
  return value.trim()
}
