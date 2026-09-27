import type { CatalogItem, School, TourSession } from "./api"
import { readTripGate } from "./checkout-flow"

export type ActivityTrip = {
  readonly activity: CatalogItem
  readonly session: TourSession
  readonly schoolName: string
  readonly registrationLabel: string
  readonly canEnroll: boolean
  readonly minimumParticipantsLabel: string | null
}

export function activeEnrollmentOptions(
  activities: readonly CatalogItem[],
  sessions: readonly TourSession[],
  schools: readonly School[],
): { readonly schools: readonly School[]; readonly sessions: readonly TourSession[] } {
  const activeCatalogKeys = new Set(
    activities
      .filter((activity) => activity.status === "active")
      .map((activity) => `${activity.organizationId}:${activity.id}`),
  )
  const visibleSessions = sessions.filter((session) =>
    session.status !== "draft"
    && session.status !== "cancelled"
    && activeCatalogKeys.has(`${session.organizationId}:${session.catalogItemId}`),
  )
  const visibleSchoolIds = new Set(visibleSessions.map((session) => session.organizationId))
  return {
    schools: schools.filter((school) => visibleSchoolIds.has(school.id)),
    sessions: visibleSessions,
  }
}

export function activityTrips(activities: readonly CatalogItem[], sessions: readonly TourSession[], schools: readonly School[]): readonly ActivityTrip[] {
  return sessions.flatMap((session) => {
    const activity = activities.find((item) => item.id === session.catalogItemId && item.organizationId === session.organizationId && item.status === "active")
    if (activity === undefined || session.status === "draft" || session.status === "cancelled") return []
    const gate = readTripGate(session, new Date().toISOString())
    const minimumParticipantsLabel = session.minimumParticipants == null ? null
      : `已付款有效人数${session.occupiedCapacity == null ? "暂未提供" : ` ${session.occupiedCapacity}`} / 最低人数 ${session.minimumParticipants}`
    return [{ activity, session, schoolName: schools.find((school) => school.id === session.organizationId)?.name ?? "学校信息待完善", registrationLabel: gate.open ? "报名开放" : gate.reason, canEnroll: gate.open, minimumParticipantsLabel }]
  })
}
