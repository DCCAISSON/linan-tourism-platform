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
