export type PersonRef = `paid:${string}` | `imported:${string}`
export type TravelerConflict = {
  readonly code: "identity_fields_conflict" | "duplicate_paid_sources" | "eligibility_conflict"
  readonly sourceRefs: readonly PersonRef[]
}
export type TravelerDto = {
  readonly personRef: PersonRef
  readonly sourceRefs: readonly PersonRef[]
  readonly source: "paid" | "imported"
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
  readonly eligibility: "paid" | "teacher" | "confirmed" | "pending" | "disabled"
  readonly eligibilityReason: string | null
  readonly importVersion: number | null
  readonly conflict: TravelerConflict | null
}
export type TravelerSource = Omit<TravelerDto, "sourceRefs" | "conflict"> & {
  readonly identityHash: string | null
  readonly phoneHash: string | null
  readonly personDataKeyVersion: string
  readonly identityCiphertext: string | null
  readonly phoneCiphertext: string | null
  readonly familyId: string | null
  readonly familyMemberId: string | null
  readonly orderId: string | null
  readonly orderLineId: string | null
  readonly importPersonId: string | null
}
export type TravelerRecord = TravelerSource & {
  readonly dedupeKey: string
  readonly sourceRefs: readonly PersonRef[]
  readonly conflict: TravelerConflict | null
}
export type TravelerSnapshot = {
  readonly tourSessionId: string
  readonly organizationId: string
  readonly rosterVersion: string
  readonly travelers: readonly TravelerDto[]
  readonly activeCount: number
  readonly inactiveCount: number
  readonly conflictCount: number
}
export type InternalTravelerSnapshot = Omit<TravelerSnapshot, "travelers"> & {
  readonly travelers: readonly TravelerRecord[]
  readonly sources: readonly TravelerRecord[]
}
