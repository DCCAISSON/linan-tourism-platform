import type { PersonRef } from "../travelers/travelers.types.js"

export type EvaluationGradeCode = "A" | "B"
export type EvaluationDimension = { readonly code: string; readonly label: string; readonly description: string }
export type DimensionObservation = { readonly code: string; readonly observation: string }
export type StandardItemInput = {
  readonly code: EvaluationGradeCode
  readonly label: string
  readonly description: string
}
export type EvaluationStandardInput = {
  readonly tourSessionId: string
  readonly title: string
  readonly items: readonly StandardItemInput[]
  readonly publicFormatNote: string
  readonly dimensions?: readonly EvaluationDimension[]
}
export type StandardConfirmationInput = {
  readonly expectedVersion: number
  readonly confirmed: true
}
export type EvaluationObservationInput = {
  readonly dimensionObservations?: readonly DimensionObservation[]
  readonly personRef: PersonRef
  readonly internalComment: string
  readonly excellent: boolean
  readonly attention: boolean
  readonly gradeCode: EvaluationGradeCode | null
}
export type BatchEvaluationInput = {
  readonly tourSessionId: string
  readonly standardId: string | null
  readonly observations: readonly EvaluationObservationInput[]
  readonly idempotencyKey: string
}
export type EvaluationRevisionInput = {
  readonly dimensionObservations?: readonly DimensionObservation[]
  readonly expectedVersion: number
  readonly internalComment: string
  readonly excellent: boolean
  readonly attention: boolean
  readonly gradeCode: EvaluationGradeCode | null
}
export type EvaluationSummaryRow = {
  readonly dimensionObservations: readonly DimensionObservation[]
  readonly id: string
  readonly version: number
  readonly standardId: string | null
  readonly personRef: PersonRef
  readonly displayName: string
  readonly organizationId: string
  readonly gradeName: string | null
  readonly className: string | null
  readonly gradeCode: EvaluationGradeCode | null
  readonly gradeLabel: string | null
  readonly internalComment: string
  readonly excellent: boolean
  readonly attention: boolean
  readonly confirmedAt: string | null
}
export type SchoolEvaluationRow = {
  readonly personRef: PersonRef
  readonly displayName: string
  readonly gradeName: string | null
  readonly className: string | null
  readonly gradeCode: EvaluationGradeCode
  readonly gradeLabel: string
}
export type EvaluationStandardSummary = {
  readonly dimensions: readonly EvaluationDimension[]
  readonly id: string
  readonly tourSessionId: string
  readonly title: string
  readonly confirmedAt: string | null
  readonly version: number
  readonly items: readonly StandardItemInput[]
}
export type EvaluationDashboard = {
  readonly organizationId: string
  readonly students: readonly { readonly personRef: PersonRef; readonly displayName: string; readonly gradeName: string | null; readonly className: string | null }[]
  readonly standards: readonly EvaluationStandardSummary[]
  readonly evaluations: readonly EvaluationSummaryRow[]
}
