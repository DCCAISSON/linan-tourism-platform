import type { TransportContactSnapshot } from "../../domain/entities/transport-session-vehicle.entity.js"
import type { TransportDocumentSnapshot } from "../../domain/entities/transport-plan.entity.js"
import type { PersonRef, TravelerDto } from "../travelers/travelers.types.js"

export type { TransportDocumentSnapshot } from "../../domain/entities/transport-plan.entity.js"

export type TransportAllocationInput = {
  readonly classId: string
  readonly studentCount: number
  readonly guardianCount: number
  readonly teacherCount: number
  readonly otherCount: number
  readonly note: string
}

export type TransportVehicleInput = {
  readonly sequence: number
  readonly seatCapacity: number
  readonly plateNumber: string
  readonly contactSnapshot: TransportContactSnapshot
  readonly allocations: readonly TransportAllocationInput[]
}

export type TransportPlanInput = {
  readonly vehicles: readonly TransportVehicleInput[]
  readonly documentSnapshot?: TransportDocumentSnapshot | null
}

export type TransportExpectedVersions = {
  readonly expectedPlanVersion: number
  readonly expectedRosterVersion: string
}

export type TransportAllocationResponse = TransportAllocationInput & {
  readonly id: string
  readonly className: string
  readonly gradeName: string
  readonly occupancy: number
}

export type TransportVehicleResponse = {
  readonly id: string
  readonly sequence: number
  readonly seatCapacity: number
  readonly plateNumber: string
  readonly contactSnapshot: TransportContactSnapshot
  readonly allocations: readonly TransportAllocationResponse[]
  readonly occupancy: number
  readonly remainingSeats: number
  readonly warnings: readonly string[]
}

export type TransportPlanResponse = {
  readonly documentSnapshot?: TransportDocumentSnapshot | null
  readonly tourSessionId: string
  readonly organizationId: string
  readonly planVersion: number
  readonly vehicles: readonly TransportVehicleResponse[]
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

export type TransportPersonAssignmentInput = {
  readonly personRef: PersonRef
  readonly vehicleId: string
}

export type TransportPersonAssignmentsInput = TransportExpectedVersions & {
  readonly assignments: readonly TransportPersonAssignmentInput[]
}

export type TransportConfirmationInput = TransportExpectedVersions

export type TransportAssignmentResponse = {
  readonly personRef: PersonRef
  readonly vehicleId: string
  readonly displayName: string
  readonly className: string | null
  readonly importedRole: "student" | "guardian" | "teacher" | null
  readonly active: boolean
  readonly conflict: TravelerDto["conflict"]
}

export type TransportPeopleVehicleResponse = TransportVehicleResponse & {
  readonly estimatedOccupancy: number
  readonly actualOccupancy: number
  readonly actualRemainingSeats: number
}

export type TransportConfirmationResponse = {
  readonly id: string
  readonly planVersion: number
  readonly rosterVersion: string
  readonly status: "current" | "stale"
  readonly confirmedAt: string
  readonly confirmedBy: string
}

export type TransportPeoplePlanResponse = {
  readonly tourSessionId: string
  readonly organizationId: string
  readonly planVersion: number
  readonly rosterVersion: string
  readonly vehicles: readonly TransportPeopleVehicleResponse[]
  readonly assignments: readonly TransportAssignmentResponse[]
  readonly unassigned: readonly TravelerDto[]
  readonly conflicts: readonly TravelerDto[]
  readonly confirmation: TransportConfirmationResponse | null
}

export type TransportSuggestionTraveler = {
  readonly personRef: PersonRef
  readonly classId: string | null
}

export type TransportSuggestionInput = {
  readonly availableSeatsBySequence: Readonly<Record<number, number>>
  readonly reservedSeatsBySequence: Readonly<Record<number, number>>
  readonly staffSeatsBySequence: Readonly<Record<number, number>>
  readonly keepFamilyTogether: boolean
  readonly allowClassSplit: boolean
  readonly travelers: readonly TransportSuggestionTraveler[]
}

export type TransportSuggestionAssignment = {
  readonly personRef: PersonRef
  readonly sequence: number
}

export type TransportSuggestionResponse =
  | {
    readonly kind: "draft"
    readonly assignments: readonly TransportSuggestionAssignment[]
    readonly explanations: readonly string[]
    readonly conflicts: readonly string[]
  }
  | {
    readonly kind: "conflict"
    readonly assignments: readonly TransportSuggestionAssignment[]
    readonly explanations: readonly string[]
    readonly conflicts: readonly string[]
  }

export type TransportAllocationRecord = {
  readonly allocationId: string | null
  readonly vehicleId: string
  readonly sequence: number | string
  readonly seatCapacity: number | string
  readonly plateNumber: string | null
  readonly contactSnapshotJson: TransportContactSnapshot | string
  readonly classId: string | null
  readonly className: string | null
  readonly gradeName: string | null
  readonly studentCount: number | string
  readonly guardianCount: number | string
  readonly teacherCount: number | string
  readonly otherCount: number | string
  readonly note: string | null
}
