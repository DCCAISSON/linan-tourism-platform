import { DOMAIN_POLICY_VERSION } from "@linan/contracts"
import { describe, expect, it } from "vitest"
import { activeEnrollmentOptions } from "../src/activity-catalog"
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
})
