export type TravelerSource = "paid" | "imported"
export type TravelerEligibility = "paid" | "teacher" | "confirmed" | "pending" | "disabled"
export type TravelerConflictCode = "identity_fields_conflict" | "duplicate_paid_sources" | "eligibility_conflict"

export type TravelerQuery = {
  readonly classId?: string
  readonly includeInactive?: boolean
  readonly source?: TravelerSource
  readonly search?: string
  readonly page?: number
  readonly pageSize?: number
}

export type TravelerRow = {
  readonly personRef: string
  readonly sourceRefs: readonly string[]
  readonly source: TravelerSource
  readonly tourSessionId: string
  readonly organizationId: string
  readonly displayName: string
  readonly gradeId: string | null
  readonly classId: string | null
  readonly gradeName: string | null
  readonly className: string | null
  readonly participantKind: "student" | "adult" | null
  readonly importedRole: "student" | "guardian" | "teacher" | null
  readonly identityMasked: string | null
  readonly phoneMasked: string | null
  readonly active: boolean
  readonly inactiveReason: "cancelled" | "payment_inactive" | "import_disabled" | "eligibility_pending" | null
  readonly eligibility: TravelerEligibility
  readonly eligibilityReason: string | null
  readonly importVersion: number | null
  readonly conflict: { readonly code: TravelerConflictCode; readonly sourceRefs: readonly string[] } | null
}

export type TravelerList = {
  readonly tourSessionId: string
  readonly organizationId: string
  readonly rosterVersion: string
  readonly travelers: readonly TravelerRow[]
  readonly activeCount: number
  readonly inactiveCount: number
  readonly conflictCount: number
  readonly total: number
  readonly page: number
  readonly pageSize: number
}

export type TravelerImportChange = {
  readonly expectedVersion: number
  readonly expectedRosterVersion: string
  readonly reason: string
}
