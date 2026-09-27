import type { PersonRef } from "../travelers/travelers.types.js"

export type ExecutionGroupPerson = {
  readonly personRef: PersonRef
  readonly displayName: string
  readonly participantKind: "student" | "adult" | null
  readonly importedRole: "student" | "guardian" | "teacher" | null
  readonly gradeName: string | null
  readonly className: string | null
  readonly vehicleId: string
  readonly vehicleSequence: number | null
}
export type ExecutionVehicle = { readonly id: string; readonly sequence: number; readonly plateNumber: string }
export type SafeAttendance = { readonly status: "present" | "absent" | "revoked"; readonly infoChecked: boolean; readonly groupJoined: boolean; readonly updatedAt: string }
export type ManagementPersonDaily = {
  readonly id: string; readonly personRef: PersonRef; readonly displayName: string; readonly reportDate: string
  readonly lodgingCheck: string; readonly mealStatus: string; readonly publicApproved: boolean; readonly publicSummary: string
  readonly version: number; readonly updatedAt: string
}
export type ExecutionManagementDetail = {
  readonly id: string; readonly code: string; readonly startsAt: string; readonly endsAt: string; readonly vehicleIds: readonly string[]
  readonly confirmationStatus: "unconfirmed" | "stale" | "current"
  readonly vehicles: readonly ExecutionVehicle[]
  readonly people: readonly (ExecutionGroupPerson & { readonly attendance: SafeAttendance | null })[]
  readonly personDailyReports: readonly ManagementPersonDaily[]
  readonly dailyReports: readonly { readonly id: string; readonly reportDate: string; readonly lodgingCheck: string; readonly mealStatus: string; readonly publicApproved: boolean; readonly publicSummary: string; readonly updatedAt: string }[]
  readonly events: readonly { readonly id: string; readonly personRef: PersonRef | null; readonly occurredAt: string; readonly category: string; readonly publicApproved: boolean; readonly publicSummary: string }[]
  readonly counts: { readonly present: number; readonly absent: number; readonly revoked: number; readonly unrecorded: number; readonly personDailyReports: number; readonly approvedPersonDailyReports: number; readonly events: number }
}

export function groupPeople(
  assignments: readonly { readonly personRef: PersonRef; readonly displayName: string; readonly participantKind?: "student" | "adult" | null; readonly importedRole?: "student" | "guardian" | "teacher" | null; readonly gradeName?: string | null; readonly className: string | null; readonly vehicleId: string }[],
  vehicles: readonly ExecutionVehicle[],
): readonly ExecutionGroupPerson[] {
  return assignments.map(row => ({ personRef: row.personRef, displayName: row.displayName, participantKind: row.participantKind ?? null, importedRole: row.importedRole ?? null, gradeName: row.gradeName ?? null, className: row.className, vehicleId: row.vehicleId, vehicleSequence: vehicles.find(vehicle => vehicle.id === row.vehicleId)?.sequence ?? null }))
}
