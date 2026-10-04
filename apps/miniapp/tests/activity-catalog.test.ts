import { DOMAIN_POLICY_VERSION } from "@linan/contracts"
import { describe, expect, it } from "vitest"
import { activeEnrollmentOptions, activitySessionChoices, activityTrips } from "../src/activity-catalog"
import { parseTourSession } from "../src/api-parsers"
import type { CatalogItem, School, TourSession } from "../src/api"

const activeActivity: CatalogItem = {
  id: "catalog-active",
  organizationId: "school-cn",
  code: "activity-cn",
  title: "大明山地质探索一日研学（体验）",
  status: "active",
  policyVersion: DOMAIN_POLICY_VERSION,
  description: "中文体验活动",
  coverImageUrl: "",
}

const publishedSession: TourSession = {
  id: "session-cn",
  organizationId: "school-cn",
  catalogItemId: activeActivity.id,
  code: "20261018-01",
  status: "published",
  priceFen: 12_800,
  capacity: 40,
  startsAt: "2026-10-18T00:00:00.000Z",
  endsAt: "2026-10-18T09:00:00.000Z",
  enrollmentOpensAt: "2026-09-01T00:00:00.000Z",
  enrollmentClosesAt: "2026-10-17T00:00:00.000Z",
  activeNoticeId: null,
  activeNotice: null,
  policyVersion: DOMAIN_POLICY_VERSION,
}

describe("activity catalog", () => {
  it.each([
    { minimumParticipants: null, occupiedCapacity: 5, label: null },
    { minimumParticipants: 10, occupiedCapacity: 0, label: "已付款且未取消：0 人 / 成团最低人数：10 人" },
    { minimumParticipants: 10, occupiedCapacity: 10, label: "已付款且未取消：10 人 / 成团最低人数：10 人" },
    { minimumParticipants: 10, occupiedCapacity: 12, label: "已付款且未取消：12 人 / 成团最低人数：10 人" },
    { minimumParticipants: 10, occupiedCapacity: null, label: "已付款且未取消人数暂未提供 / 成团最低人数：10 人" },
  ])("displays the paid headcount reference for $occupiedCapacity / $minimumParticipants", ({ minimumParticipants, occupiedCapacity, label }) => {
    const session = parseTourSession({ ...publishedSession, minimumParticipants, occupiedCapacity })
    const trips = activityTrips([activeActivity], [session], [])
    expect(trips[0]).toMatchObject({ minimumParticipantsLabel: label })
  })

  it("keeps old responses valid without inventing a zero paid count", () => {
    const session = parseTourSession(publishedSession)
    expect(session).toMatchObject({ minimumParticipants: null, occupiedCapacity: null })
  })

  it.each([0, -1, 1.5, "10", 41])("rejects malformed minimum %s in the read model", (minimumParticipants) => {
    expect(() => parseTourSession({ ...publishedSession, minimumParticipants })).toThrow()
  })

  it("keeps enrollment choices limited to active activities and their schools", () => {
    const schools: readonly School[] = [
      { id: "school-cn", code: "school-cn", name: "临安文旅体验学校" },
      { id: "school-old", code: "school-old", name: "Linan Test School" },
    ]
    const activities: readonly CatalogItem[] = [
      activeActivity,
      { ...activeActivity, id: "catalog-old", organizationId: "school-old", title: "Qingshan Lake Study Tour", status: "inactive" },
    ]
    const sessions: readonly TourSession[] = [
      publishedSession,
      { ...publishedSession, id: "session-old", organizationId: "school-old", catalogItemId: "catalog-old" },
    ]

    expect(activeEnrollmentOptions(activities, sessions, schools)).toEqual({
      schools: [schools[0]],
      sessions: [publishedSession],
    })
  })

  it("keeps a detail date selector within the selected activity and school", () => {
    const sameActivityLater = parseTourSession({ ...publishedSession, id: "session-later", code: "20261025-01" })
    const anotherSchool = parseTourSession({ ...publishedSession, id: "session-other-school", organizationId: "school-other", code: "20261018-02" })
    const trips = activityTrips(
      [activeActivity, { ...activeActivity, organizationId: "school-other" }],
      [publishedSession, sameActivityLater, anotherSchool],
      [],
    )

    expect(activitySessionChoices(trips, publishedSession.id).map((trip) => trip.session.id)).toEqual([
      publishedSession.id,
      sameActivityLater.id,
    ])
  })
})
