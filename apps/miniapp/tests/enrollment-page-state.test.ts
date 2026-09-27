import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { effectScope, nextTick, type EffectScope } from "vue"
import { DOMAIN_POLICY_VERSION } from "@linan/contracts"
import type { TourSession, SavedEnrollmentMember, CreateOrderPayload, Order } from "../src/api"
import { useEnrollmentPage } from "../src/pages/index/useEnrollmentPage"

vi.mock("vue", async (importOriginal) => ({ ...await importOriginal<typeof import("vue")>(), onMounted: () => undefined }))
vi.mock("@dcloudio/uni-app", () => ({ onLoad: () => undefined }))
const apiCalls = vi.hoisted(() => ({
  listEnrollmentMembers: vi.fn<() => Promise<readonly SavedEnrollmentMember[]>>(),
  submitEnrollment: vi.fn(async () => ({ id: "enrollment-one", status: "submitted" })),
  createOrder: vi.fn<(payload: CreateOrderPayload) => Promise<Order>>(),
}))
beforeEach(() => {
  vi.clearAllMocks()
  apiCalls.listEnrollmentMembers.mockResolvedValue([])
  apiCalls.createOrder.mockResolvedValue({ id: "order-one", code: "ORDER", enrollmentId: "enrollment-one", status: "pending_payment", amountFen: 100, paidFen: 0, payerName: "家长", participantCount: 1 })
})
vi.mock("../src/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/api")>(),
  createMiniappApi: () => ({ ...apiCalls, listGrades: async () => [], checkEnrollmentAvailability: async () => undefined }),
}))
const scopes: EffectScope[] = []
afterEach(() => { for (const scope of scopes) scope.stop(); scopes.length = 0 })
function pageState() {
  const scope = effectScope()
  scopes.push(scope)
  const page = scope.run(useEnrollmentPage)
  if (page === undefined) throw new Error("page scope was not active")
  return page
}
function session(id: string, noticeVersion = "v1"): TourSession {
  return {
    id, organizationId: "school", catalogItemId: "activity", code: id, status: "published", priceFen: 100,
    capacity: 30, startsAt: "2026-11-01T00:00:00.000Z", endsAt: "2026-11-02T00:00:00.000Z",
    enrollmentOpensAt: "2026-01-01T00:00:00.000Z", enrollmentClosesAt: "2026-10-31T00:00:00.000Z",
    activeNoticeId: "notice", policyVersion: DOMAIN_POLICY_VERSION,
    activeNotice: { id: "notice", organizationId: "school", tourSessionId: id, version: noticeVersion,
      title: "出行告知书", createdAt: "2026-09-01T00:00:00.000Z", contentJson: {
        destination: "临安", departurePlace: "学校", mealNote: "含午餐", itinerary: ["集合"], unitPrices: ["每人一元"], packageExamples: [], reminders: ["携带证件"],
      } },
  }
}

describe("enrollment draft recovery", () => {
  it("keeps guest form input and waits for consent before opening review", async () => {
    const page = pageState()
    vi.stubGlobal("uni", { pageScrollTo: vi.fn() })
    page.authenticated.value = false
    page.catalog.sessions = [session("first")]
    Object.assign(page.draft, { selectedTourSessionId: "first", selectedSchoolId: "school", contactName: "王女士", contactPhone: "19900003099", familyMembers: [{ id: "local", code: "local", displayName: "学生甲", participantKind: "adult", identityNumber: "110105201001010010", selected: true }] })
    await nextTick()
    page.draft.agreementAccepted = true
    page.enterReview()
    expect(page.pageMode.value).toBe("editing")
    expect(apiCalls.submitEnrollment).not.toHaveBeenCalled()
    await page.completeLogin()
    expect(page.pageMode.value).toBe("review")
    expect(page.draft.contactName).toBe("王女士")
    expect(page.draft.familyMembers[0]?.displayName).toBe("学生甲")
    vi.unstubAllGlobals()
  })
  it("keeps and allows deletion of a one-time participant created before a failed submission", async () => {
    // Given: the member API succeeded, but enrollment submission has not completed.
    const page = pageState()
    page.catalog.schools = [{ id: "school", code: "school", name: "学校" }]
    page.draft.familyMembers = [{ id: "local-person", remoteMemberId: "uploaded-person", code: "person", displayName: "学生甲", selected: true, saveAsCommon: false }]
    // When
    await page.onSchoolChange({ detail: { value: 0 } })
    // Then
    expect(page.draft.familyMembers).toHaveLength(1)
    expect(page.draft.familyMembers[0]?.fromCommonList).not.toBe(true)
    page.removeMember("local-person")
    expect(page.draft.familyMembers).toEqual([])
  })
  it("does not delete an existing common participant when removing a local draft", () => {
    // Given
    const page = pageState()
    page.draft.familyMembers = [{ id: "saved-person", remoteMemberId: "saved-person", fromCommonList: true, code: "person", displayName: "学生甲", selected: true }]
    // When
    page.removeMember("saved-person")
    // Then
    expect(page.draft.familyMembers).toHaveLength(1)
  })
  it("clears consent when the selected tour changes", async () => {
    // Given
    const page = pageState()
    page.catalog.sessions = [session("first"), session("second")]
    page.draft.selectedTourSessionId = "first"
    await nextTick()
    page.draft.agreementAccepted = true
    // When
    page.draft.selectedTourSessionId = "second"
    await nextTick()
    // Then
    expect(page.draft.agreementAccepted).toBe(false)
  })
  it("clears consent when the notice version changes for the same tour", async () => {
    // Given
    const page = pageState()
    page.catalog.sessions = [session("first")]
    page.draft.selectedTourSessionId = "first"
    await nextTick()
    page.draft.agreementAccepted = true
    // When
    page.catalog.sessions = [session("first", "v2")]
    await nextTick()
    // Then
    expect(page.draft.agreementAccepted).toBe(false)
  })
})


describe("enrollment submission and common participant scope", () => {
  it("keeps one local participant when a refreshed common list includes the same uploaded member", async () => {
    // Given: saving the member succeeded before the session expired.
    const page = pageState()
    page.catalog.schools = [{ id: "school", code: "school", name: "学校" }]
    page.draft.selectedSchoolId = "school"
    page.draft.familyMembers = [{ id: "local-person", remoteMemberId: "uploaded-person", code: "person", displayName: "学生甲", selected: true, saveAsCommon: true }]
    apiCalls.listEnrollmentMembers.mockResolvedValue([{ id: "uploaded-person", code: "person", displayName: "学生甲", participantKind: "student", schoolId: "school", gradeId: "grade", classId: "class" }])
    await page.completeLogin()
    // When
    await page.onSchoolChange({ detail: { value: 0 } })
    // Then
    expect(page.draft.familyMembers).toHaveLength(1)
    expect(page.draft.familyMembers[0]).toMatchObject({ id: "local-person", remoteMemberId: "uploaded-person", selected: true })
  })
  it("does not offer a common adult from another school after login or school change", async () => {
    // Given
    const page = pageState()
    page.catalog.schools = [{ id: "school", code: "school", name: "学校" }]
    page.draft.selectedSchoolId = "school"
    apiCalls.listEnrollmentMembers.mockResolvedValue([{ id: "adult", code: "adult", displayName: "成人", participantKind: "adult", schoolId: "other-school", gradeId: null, classId: null }])
    // When
    await page.completeLogin()
    await page.onSchoolChange({ detail: { value: 0 } })
    // Then
    expect(page.draft.familyMembers).toEqual([])
  })
  it("retries a lost order response using the same enrollment and idempotency key", async () => {
    // Given
    const page = pageState()
    page.catalog.sessions = [session("first")]
    Object.assign(page.draft, { selectedTourSessionId: "first", selectedSchoolId: "school", contactName: "家长", contactPhone: "19900003099", familyMembers: [{ id: "saved", remoteMemberId: "saved", fromCommonList: true, code: "saved", displayName: "学生", selected: true }] })
    await nextTick()
    page.draft.agreementAccepted = true
    await nextTick()
    page.pageMode.value = "review"
    apiCalls.createOrder.mockRejectedValueOnce(new Error("order response lost"))
    await page.submitEnrollment()
    // When
    await page.submitEnrollment()
    // Then
    expect(apiCalls.submitEnrollment).toHaveBeenCalledTimes(1)
    expect(apiCalls.createOrder).toHaveBeenCalledTimes(2)
    expect(apiCalls.createOrder.mock.calls[0]).toEqual(apiCalls.createOrder.mock.calls[1])
    expect(page.pageMode.value).toBe("paymentPending")
  })
  it("clears a previous submission only after the enrollment details change", async () => {
    // Given
    const page = pageState()
    page.submissionCode.value = "enrollment-one"
    page.backToEdit()
    expect(page.submissionCode.value).toBe("enrollment-one")
    // When
    page.draft.contactPhone = "19900003099"
    await nextTick()
    // Then
    expect(page.submissionCode.value).toBe("")
  })
})
