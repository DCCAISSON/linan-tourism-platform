export type TransportContactSnapshot = {
  readonly driverName: string
  readonly driverPhone: string
  readonly guideName: string
  readonly guidePhone: string
  readonly teacherName: string
  readonly teacherPhone: string
}

export type TransportAllocation = {
  readonly id?: string
  readonly classId: string
  readonly className?: string
  readonly gradeName?: string
  readonly studentCount: number
  readonly guardianCount: number
  readonly teacherCount: number
  readonly otherCount: number
  readonly note: string
  readonly occupancy?: number
}

export type TransportVehicle = {
  readonly id?: string
  readonly sequence: number
  readonly seatCapacity: number
  readonly plateNumber: string
  readonly contactSnapshot: TransportContactSnapshot
  readonly allocations: readonly TransportAllocation[]
  readonly occupancy?: number
  readonly remainingSeats?: number
  readonly warnings?: readonly string[]
}

export type TransportPlan = {
  readonly tourSessionId: string
  readonly organizationId: string
  readonly planVersion: number
  readonly vehicles: readonly TransportVehicle[]
  readonly totals: {
    readonly studentCount: number
    readonly guardianCount: number
    readonly teacherCount: number
    readonly otherCount: number
    readonly occupancy: number
    readonly seatCapacity: number
  }
  readonly warnings: readonly string[]
}

export type TransportPlanPayload = {
  readonly vehicles: readonly TransportVehicle[]
}

export type PersonRef = `paid:${string}` | `imported:${string}`

export type TransportAssignment = {
  readonly personRef: PersonRef
  readonly vehicleId: string
  readonly displayName: string
  readonly className: string | null
  readonly importedRole: "student" | "guardian" | "teacher" | null
  readonly active: boolean
  readonly conflict: { readonly code: string; readonly sourceRefs: readonly PersonRef[] } | null
}

export type TransportTraveler = {
  readonly personRef: PersonRef
  readonly displayName: string
  readonly className: string | null
  readonly importedRole: "student" | "guardian" | "teacher" | null
  readonly active: boolean
}

export type TransportPeopleVehicle = TransportVehicle & {
  readonly estimatedOccupancy: number
  readonly actualOccupancy: number
  readonly actualRemainingSeats: number
}

export type TransportConfirmation = {
  readonly id: string
  readonly planVersion: number
  readonly rosterVersion: string
  readonly status: "current" | "stale"
  readonly confirmedAt: string
  readonly confirmedBy: string
}

export type TransportPeoplePlan = {
  readonly tourSessionId: string
  readonly organizationId: string
  readonly planVersion: number
  readonly rosterVersion: string
  readonly vehicles: readonly TransportPeopleVehicle[]
  readonly assignments: readonly TransportAssignment[]
  readonly unassigned: readonly TransportTraveler[]
  readonly conflicts: readonly TransportTraveler[]
  readonly confirmation: TransportConfirmation | null
}

export type TransportAssignmentsPayload = {
  readonly expectedPlanVersion: number
  readonly expectedRosterVersion: string
  readonly assignments: readonly { readonly personRef: PersonRef; readonly vehicleId: string }[]
}

export type TransportConfirmationPayload = {
  readonly expectedPlanVersion: number
  readonly expectedRosterVersion: string
}

export type TransportSuggestionPayload = {
  readonly availableSeatsBySequence: Readonly<Record<number, number>>
  readonly reservedSeatsBySequence: Readonly<Record<number, number>>
  readonly staffSeatsBySequence: Readonly<Record<number, number>>
  readonly keepFamilyTogether: boolean
  readonly allowClassSplit: boolean
}

export type TransportSuggestion = {
  readonly kind: "draft" | "conflict"
  readonly assignments: readonly { readonly personRef: PersonRef; readonly sequence: number }[]
  readonly explanations: readonly string[]
  readonly conflicts: readonly string[]
}
