import type { PersonRef, TravelerDto } from "../travelers/travelers.types.js"

export type AttendanceStatus = "present" | "absent" | "revoked"
export type AttendanceInput = {
  readonly status: AttendanceStatus
  readonly infoChecked: boolean
  readonly groupJoined: boolean
  readonly note: string
}
export type AttendanceResponse = AttendanceInput & {
  readonly id: string
  readonly tourSessionId: string
  readonly vehicleId: string
  readonly personRef: PersonRef
  readonly version: number
  readonly updatedAt: string
}
export type GuideSessionSummary = {
  readonly id: string
  readonly code: string
  readonly startsAt: string
  readonly endsAt: string
  readonly vehicleIds: readonly string[]
}
export type GuidePersonResponse = TravelerDto & {
  readonly vehicleId: string
  readonly attendance: AttendanceResponse | null
  readonly healthAuthorized: boolean
}
export type GuideSessionResponse = GuideSessionSummary & {
  readonly people: readonly GuidePersonResponse[]
  readonly dailyReports: readonly DailyReportResponse[]
  readonly events: readonly EventResponse[]
}
export type DailyReportInput = {
  readonly reportDate: string
  readonly lodgingCheck: string
  readonly mealStatus: string
  readonly bodyStatus: string
  readonly note: string
}
export type DailyReportResponse = DailyReportInput & {
  readonly id: string
  readonly tourSessionId: string
  readonly publicSummary: string
  readonly publicApproved: boolean
  readonly version: number
  readonly updatedAt: string
}
export type EventInput = {
  readonly category: "objective" | "health" | "safety" | "other"
  readonly occurredAt: Date
  readonly personRef: PersonRef | null
  readonly content: string
}
export type EventResponse = Omit<EventInput, "occurredAt"> & {
  readonly id: string
  readonly tourSessionId: string
  readonly occurredAt: string
  readonly publicSummary: string
  readonly publicApproved: boolean
  readonly version: number
  readonly updatedAt: string
}
export type PublicApprovalInput = { readonly publicSummary: string }
export type FamilyPublicSummary = {
  readonly tourSessionId: string
  readonly personDailyReports: readonly { readonly personRef: PersonRef; readonly displayName: string; readonly reportDate: string; readonly publicSummary: string }[]
  readonly dailyReports: readonly Pick<DailyReportResponse, "reportDate" | "publicSummary">[]
  readonly events: readonly Pick<EventResponse, "occurredAt" | "category" | "publicSummary">[]
}
export type HealthAuthorizationInput = {
  readonly personRef: PersonRef
  readonly allergies: string
  readonly medicalNotes: string
  readonly emergencyMedicine: string
}
export type HealthAuthorizationResponse = {
  readonly id: string
  readonly tourSessionId: string
  readonly orderId: string
  readonly personRef: PersonRef
  readonly active: boolean
  readonly version: number
  readonly authorizedAt: string
  readonly revokedAt: string | null
}
export type HealthReadResponse = HealthAuthorizationResponse & {
  readonly health: Omit<HealthAuthorizationInput, "personRef">
}
