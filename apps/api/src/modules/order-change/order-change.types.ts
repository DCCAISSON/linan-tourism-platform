import type { NewFamilyMember } from "../enrollment/enrollment.types.js"
import type { ParticipantKind, ProtectedPersonData } from "../enrollment/person-data.js"

export const ORDER_CHANGE_STATUSES = ["submitted", "needs_information", "approved", "rejected", "withdrawn"] as const
export type OrderChangeStatus = (typeof ORDER_CHANGE_STATUSES)[number]
export type OrderChangeKind = "replacement" | "addition"
export type OrderChangeDecision = "needs_information" | "approved" | "rejected"

export type ChangeParticipant = {
  readonly displayName: string
  readonly participantKind: ParticipantKind
  readonly schoolId: string
  readonly schoolName: string
  readonly gradeId: string | null
  readonly gradeName: string | null
  readonly classId: string | null
  readonly className: string | null
  readonly personData: ProtectedPersonData
}

export type PublicChangeParticipant = Omit<ChangeParticipant, "personData"> & {
  readonly identityNumberMasked: string
  readonly phoneMasked: string
}

export type OriginalOrderLine = {
  readonly id: string
  readonly displayName: string
  readonly participantKind: ParticipantKind
  readonly gradeName: string | null
  readonly className: string | null
  readonly amountFen: number
  readonly identityCiphertext: string | null
  readonly identityNumberMasked: string | null
  readonly phoneCiphertext: string | null
  readonly phoneMasked: string | null
  readonly personDataKeyVersion: string
}

export type OriginalOrderSnapshot = {
  readonly orderCode: string
  readonly amountFen: number
  readonly paidFen: number
  readonly tourSessionId: string
  readonly lines: readonly OriginalOrderLine[]
}

export type ChangeHistoryEntry = {
  readonly version: number
  readonly status: OrderChangeStatus
  readonly action: "submitted" | "resubmitted" | "reviewed" | "note" | "withdrawn"
  readonly actorId: string
  readonly actorName: string
  readonly note: string
  readonly at: string
}

export type OrderChangeResponse = {
  readonly id: string
  readonly orderId: string
  readonly orderCode: string
  readonly kind: OrderChangeKind
  readonly originalLineId: string | null
  readonly reason: string
  readonly status: OrderChangeStatus
  readonly version: number
  readonly originalSnapshot: Omit<OriginalOrderSnapshot, "lines"> & {
    readonly lines: readonly Omit<OriginalOrderLine, "identityCiphertext" | "phoneCiphertext" | "personDataKeyVersion">[]
  }
  readonly proposedParticipant: PublicChangeParticipant
  readonly history: readonly Omit<ChangeHistoryEntry, "actorId">[]
  readonly refundConflict: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

export type OrderChangeList = {
  readonly schoolId: string
  readonly activeRefundLineIds: readonly string[]
  readonly requests: readonly OrderChangeResponse[]
}

export type SubmitOrderChange = {
  readonly kind: OrderChangeKind
  readonly originalLineId: string | null
  readonly participant: NewFamilyMember
  readonly reason: string
  readonly idempotencyKey: string
}

export type SupplementOrderChange = {
  readonly expectedVersion: number
  readonly reason: string
  readonly participant: NewFamilyMember | undefined
}

export type ReviewOrderChange = {
  readonly expectedVersion: number
  readonly decision: OrderChangeDecision
  readonly note: string
}
