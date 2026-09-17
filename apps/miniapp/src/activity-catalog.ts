import type { CatalogItem, School, TourSession } from "./api"
import { readTripGate } from "./checkout-flow"

export type ActivityTrip = {
  readonly activity: CatalogItem
  readonly session: TourSession
  readonly schoolName: string
  readonly registrationLabel: string
  readonly canEnroll: boolean
}

export function activityTrips(activities: readonly CatalogItem[], sessions: readonly TourSession[], schools: readonly School[]): readonly ActivityTrip[] {
  return sessions.flatMap((session) => {
    const activity = activities.find((item) => item.id === session.catalogItemId && item.organizationId === session.organizationId && item.status === "active")
    if (activity === undefined || session.status === "draft" || session.status === "cancelled") return []
    const gate = readTripGate(session, new Date().toISOString())
    return [{ activity, session, schoolName: schools.find((school) => school.id === session.organizationId)?.name ?? "学校信息待完善", registrationLabel: gate.open ? "报名开放" : gate.reason, canEnroll: gate.open }]
  })
}
