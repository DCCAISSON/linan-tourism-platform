import type { TransportContactSnapshot } from "../../domain/entities/transport-session-vehicle.entity.js"

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
  readonly tourSessionId: string
  readonly organizationId: string
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
