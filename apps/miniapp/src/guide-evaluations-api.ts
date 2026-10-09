import { ApiError } from "./api-error"
import { readCollection, readNonNegativeInteger, readRecord, readString } from "./api-parsers"
import type { PersonRef } from "./guide-execution-api"
import { createStaffRequest, type StaffRequestOptions } from "./staff-api"

export type EvaluationStudent = { readonly personRef: PersonRef; readonly displayName: string; readonly gradeName: string | null; readonly className: string | null }
export type EvaluationDimension = { readonly code: string; readonly label: string; readonly description: string }
export type DimensionObservation = { readonly code: string; readonly observation: string }
export type EvaluationStandard = {
  readonly id: string; readonly tourSessionId: string; readonly title: string; readonly version: number; readonly confirmedAt: string | null
  readonly items: readonly { readonly code: "A" | "B"; readonly label: string; readonly description: string }[]
  readonly dimensions: readonly EvaluationDimension[]
}
export type EvaluationRow = EvaluationStudent & {
  readonly id: string; readonly version: number; readonly organizationId: string; readonly standardId: string | null
  readonly gradeCode: "A" | "B" | null; readonly gradeLabel: string | null; readonly internalComment: string
  readonly excellent: boolean; readonly attention: boolean; readonly confirmedAt: string | null; readonly dimensionObservations: readonly DimensionObservation[]
}
export type EvaluationDashboard = { readonly organizationId: string; readonly students: readonly EvaluationStudent[]; readonly standards: readonly EvaluationStandard[]; readonly evaluations: readonly EvaluationRow[] }
export type EvaluationObservation = Pick<EvaluationRow, "personRef" | "gradeCode" | "internalComment" | "excellent" | "attention" | "dimensionObservations">
export type EvaluationCreateInput = { readonly tourSessionId: string; readonly standardId: string | null; readonly observations: readonly [EvaluationObservation]; readonly idempotencyKey: string }
export type EvaluationRevision = Omit<EvaluationObservation, "personRef"> & { readonly standardId?: string }

export function createGuideEvaluationsApi(options: StaffRequestOptions = {}) {
  const request = createStaffRequest(options)
  return {
    getDashboard: async (id: string): Promise<EvaluationDashboard> => {
      const row = readRecord(await request(`/evaluations/staff/sessions/${encodeURIComponent(id)}`))
      return { organizationId: readString(row, "organizationId"), students: readCollection(row["students"], parseStudent), standards: readCollection(row["standards"], parseStandard), evaluations: readCollection(row["evaluations"], parseEvaluation) }
    },
    create: async (input: EvaluationCreateInput): Promise<EvaluationRow> => {
      const rows = readCollection(await request("/evaluations/staff/batch", "POST", input), parseEvaluation)
      const row = rows[0]
      if (rows.length !== 1 || !row || row.personRef !== input.observations[0].personRef) throw invalid()
      return row
    },
    revise: async (previous: EvaluationRow, input: EvaluationRevision): Promise<EvaluationRow> => {
      const row = parseEvaluation(await request(`/evaluations/staff/${encodeURIComponent(previous.id)}`, "POST", { ...input, expectedVersion: previous.version }))
      if (row.id !== previous.id || row.personRef !== previous.personRef || row.version <= previous.version) throw invalid()
      return row
    },
    confirm: async (id: string): Promise<readonly EvaluationRow[]> => {
      const rows = readCollection(await request(`/evaluations/staff/sessions/${encodeURIComponent(id)}/confirm`, "POST", {}), parseEvaluation)
      if (rows.length === 0 || rows.some(row => row.confirmedAt === null || row.gradeCode === null || row.standardId === null)) throw invalid()
      return rows
    },
  }
}
export type GuideEvaluationsApi = ReturnType<typeof createGuideEvaluationsApi>

function parseStudent(value: unknown): EvaluationStudent {
  const row = readRecord(value)
  const personRef = readString(row, "personRef")
  if (!isPersonRef(personRef)) throw invalid()
  return { personRef, displayName: readString(row, "displayName"), gradeName: nullable(row, "gradeName"), className: nullable(row, "className") }
}
function parseStandard(value: unknown): EvaluationStandard {
  const row = readRecord(value)
  return {
    id: readString(row, "id"), tourSessionId: readString(row, "tourSessionId"), title: readString(row, "title"), version: readNonNegativeInteger(row, "version"), confirmedAt: timestamp(row, "confirmedAt"),
    items: readCollection(row["items"], value => {
      const item = readRecord(value)
      const code = grade(item["code"])
      if (code === null) throw invalid()
      return { code, label: readString(item, "label"), description: text(item, "description") }
    }),
    dimensions: readCollection(row["dimensions"] ?? [], value => { const dimension = readRecord(value); return { code: readString(dimension, "code"), label: readString(dimension, "label"), description: text(dimension, "description") } }),
  }
}
function parseEvaluation(value: unknown): EvaluationRow {
  const row = readRecord(value)
  return {
    ...parseStudent(row), id: readString(row, "id"), version: readNonNegativeInteger(row, "version"), organizationId: readString(row, "organizationId"), standardId: nullable(row, "standardId"),
    gradeCode: grade(row["gradeCode"]), gradeLabel: nullable(row, "gradeLabel"), internalComment: text(row, "internalComment"), excellent: boolean(row, "excellent"), attention: boolean(row, "attention"), confirmedAt: timestamp(row, "confirmedAt"),
    dimensionObservations: readCollection(row["dimensionObservations"] ?? [], value => { const observation = readRecord(value); return { code: readString(observation, "code"), observation: text(observation, "observation") } }),
  }
}
function isPersonRef(value: string): value is PersonRef { return /^(paid|imported):[\w-]{1,64}$/.test(value) }
function grade(value: unknown): EvaluationRow["gradeCode"] { if (value === "A" || value === "B" || value === null) return value; throw invalid() }
function text(row: Record<string, unknown>, key: string): string { const value = row[key]; if (typeof value === "string") return value; throw invalid() }
function nullable(row: Record<string, unknown>, key: string): string | null { return row[key] === null ? null : text(row, key) }
function timestamp(row: Record<string, unknown>, key: string): string | null { const value = nullable(row, key); if (value === null || Number.isFinite(Date.parse(value))) return value; throw invalid() }
function boolean(row: Record<string, unknown>, key: string): boolean { const value = row[key]; if (typeof value === "boolean") return value; throw invalid() }
function invalid(): ApiError { return new ApiError(0, "评价结果暂时无法核实，请刷新查看后再操作。") }
