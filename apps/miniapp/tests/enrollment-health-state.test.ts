import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { effectScope, nextTick, type EffectScope } from "vue"
import { DOMAIN_POLICY_VERSION } from "@linan/contracts"
import { ApiError, type Order, type OrderDetail, type TourSession } from "../src/api"
import { useEnrollmentPage } from "../src/pages/index/useEnrollmentPage"

vi.mock("vue", async (original) => ({ ...await original<typeof import("vue")>(), onMounted: () => undefined }))
vi.mock("@dcloudio/uni-app", () => ({ onLoad: () => undefined, onShow: () => undefined, onHide: () => undefined, onUnload: () => undefined }))
const calls = vi.hoisted(() => ({
  submitEnrollment: vi.fn(async () => ({ id: "enrollment", status: "submitted" })),
  createOrder: vi.fn<() => Promise<Order>>(),
  getOrderDetail: vi.fn<() => Promise<OrderDetail>>(),
  createEnrollmentMember: vi.fn(async () => ({ id: "new-member" })),
  authorize: vi.fn<(orderId: string, lineId: string, payload: object, token: string | undefined) => Promise<void>>(),
  listEnrollmentMembers: vi.fn(async () => []),
  token: "first-token",
  phoneVerificationToken: "first-token",
}))
vi.mock("../src/api", async (original) => ({ ...await original<typeof import("../src/api")>(), createMiniappApi: () => ({
  ...calls, checkEnrollmentAvailability: async () => undefined,
}) }))
vi.mock("../src/execution-health-api", () => ({ createExecutionHealthClient: () => {
  const token = calls.token
  return { authorizePaidHealth: (orderId: string, lineId: string, payload: object) => calls.authorize(orderId, lineId, payload, token) }
} }))
const order: Order = { id: "order", code: "ORDER", enrollmentId: "enrollment", status: "pending_payment", amountFen: 200, paidFen: 0, payerName: "家长", participantCount: 2 }
const scopes: EffectScope[] = []
beforeEach(() => {
  vi.clearAllMocks()
  calls.token = "first-token"
  calls.phoneVerificationToken = "first-token"
  calls.createOrder.mockResolvedValue(order)
  calls.createEnrollmentMember.mockReset().mockResolvedValue({ id: "new-member" })
  calls.authorize.mockReset().mockResolvedValue(undefined)
  calls.getOrderDetail.mockResolvedValue({ ...order, tourSessionId: "trip", activityTitle: "研学", schoolName: "学校", startsAt: "2026-11-01", endsAt: "2026-11-02", createdAt: "2026-09-27", contactName: "家长", emergencyContactName: null, emergencyContactPhone: null, refundSummary: { status: "none", refundedFen: 0, pendingFen: 0, failedCount: 0 }, refundHistory: [], participants: ["second", "first"].map((id) => ({ id: `line-${id}`, familyMemberId: id, enrollmentParticipantId: `participant-${id}`, displayName: "同名学生", participantKind: "student", gradeName: "五年级", className: "二班", amountFen: 100, refundedFen: 0, refundStatus: "none" })) })
  vi.stubGlobal("uni", { pageScrollTo: vi.fn(), getStorageSync: (key: string) => {
    if (key === "linan_service_consent") return { version: "2026-10-09.1", choice: "accepted" }
    if (key === "linan_enrollment_draft_identity") return { token: calls.token, familyCode: "same-family" }
    if (key === "linan_wechat_phone_verification") return { token: calls.phoneVerificationToken, phoneVerified: true }
    return calls.token
  }, setStorageSync: vi.fn() })
})
afterEach(() => { scopes.splice(0).forEach((scope) => scope.stop()); vi.unstubAllGlobals() })

async function preparedPage() {
  const scope = effectScope()
  scopes.push(scope)
  const page = scope.run(useEnrollmentPage)
  if (page === undefined) throw new Error("Missing page scope")
  const session: TourSession = { id: "trip", organizationId: "school", catalogItemId: "activity", code: "研学", status: "published", priceFen: 100, capacity: 30, startsAt: "2026-11-01T00:00:00.000Z", endsAt: "2026-11-02T00:00:00.000Z", enrollmentOpensAt: "2026-01-01T00:00:00.000Z", enrollmentClosesAt: "2026-10-31T00:00:00.000Z", activeNoticeId: "notice", policyVersion: DOMAIN_POLICY_VERSION, activeNotice: { id: "notice", organizationId: "school", tourSessionId: "trip", version: "v1", title: "告知书", createdAt: "2026-09-01", contentJson: { destination: "临安", departurePlace: "学校", mealNote: "含午餐", itinerary: [], unitPrices: [], packageExamples: [], reminders: [] } } }
  page.catalog.sessions = [session]
  Object.assign(page.draft, { selectedSchoolId: "school", selectedTourSessionId: "trip", contactName: "家长", contactPhone: "19900003099", familyMembers: ["first", "second"].map((id) => ({ id, remoteMemberId: id, fromCommonList: true, code: id, displayName: "同名学生", selected: true, healthNotes: `备注-${id}`, healthConsent: true })) })
  await nextTick()
  page.draft.agreementAccepted = true
  for (const member of page.draft.familyMembers) Object.assign(member, { healthConsent: true })
  await nextTick()
  page.pageMode.value = "review"
  return page
}

describe("optional enrollment health", () => {
  it("maps same-name people by family member ID when order lines return in reverse order", async () => {
    // Given
    const page = await preparedPage()
    // When
    await page.submitEnrollment()
    // Then
    expect(calls.authorize.mock.calls.map((call) => [call[1], call[2]])).toEqual([
      ["line-first", { allergies: "", medicalNotes: "备注-first", emergencyMedicine: "" }],
      ["line-second", { allergies: "", medicalNotes: "备注-second", emergencyMedicine: "" }],
    ])
    expect(JSON.stringify(calls.submitEnrollment.mock.calls)).not.toContain("备注-")
    expect(uni.setStorageSync).not.toHaveBeenCalled()
    expect(page.draft.familyMembers.every((member) => member.healthNotes === undefined)).toBe(true)
  })

  it("submits enrollment without health requests when notes are blank or consent is absent", async () => {
    // Given
    const page = await preparedPage()
    const [first, second] = page.draft.familyMembers
    if (first === undefined || second === undefined) throw new Error("Missing members")
    first.healthNotes = "  "
    second.healthConsent = false
    // When
    await page.submitEnrollment()
    // Then
    expect(calls.authorize).not.toHaveBeenCalled()
    expect(calls.getOrderDetail).not.toHaveBeenCalled()
    expect(calls.submitEnrollment).toHaveBeenCalledTimes(1)
    expect(page.order.value?.id).toBe("order")
  })

  it("retries only the failed health item after partial success without another enrollment or order", async () => {
    // Given
    const page = await preparedPage()
    calls.authorize.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new ApiError(500, "失败"))
    await page.submitEnrollment()
    expect(page.healthState.value).toBe("error")
    expect(page.draft.familyMembers[0]?.healthNotes).toBeUndefined()
    expect(page.draft.familyMembers[1]?.healthNotes).toBe("备注-second")
    // When
    await page.retryHealthNotes()
    // Then
    expect(calls.authorize.mock.calls.map((call) => call[1])).toEqual(["line-first", "line-second", "line-second"])
    expect(calls.submitEnrollment).toHaveBeenCalledTimes(1)
    expect(calls.createOrder).toHaveBeenCalledTimes(1)
    expect(page.healthState.value).toBe("saved")
    expect(page.order.value?.id).toBe("order")
  })

  it("retains order and notes through cancelled health re-login and retries with a newly created token client", async () => {
    // Given
    const page = await preparedPage()
    calls.authorize.mockRejectedValueOnce(new ApiError(401, "登录过期"))
    await page.submitEnrollment()
    await page.retryHealthNotes()
    page.cancelLogin()
    expect(page.order.value?.id).toBe("order")
    expect(page.submissionCode.value).toBe("enrollment")
    expect(page.draft.familyMembers[0]?.healthNotes).toBe("备注-first")
    calls.token = "new-token"
    calls.phoneVerificationToken = "new-token"
    // When
    await page.completeLogin()
    // Then
    expect(calls.authorize.mock.calls.map((call) => call[3])).toEqual(["first-token", "new-token", "new-token"])
    expect(calls.listEnrollmentMembers).not.toHaveBeenCalled()
    expect(calls.submitEnrollment).toHaveBeenCalledTimes(1)
    expect(calls.createOrder).toHaveBeenCalledTimes(1)
    expect(page.pageMode.value).toBe("paymentPending")
    expect(page.healthState.value).toBe("saved")
  })

  it("leaves failed health associated with its frozen order even if enrollment draft changes", async () => {
    // Given
    const page = await preparedPage()
    calls.authorize.mockRejectedValueOnce(new ApiError(500, "失败"))
    await page.submitEnrollment()
    page.draft.selectedTourSessionId = "another-trip"
    const first = page.draft.familyMembers[0]
    if (first !== undefined) first.healthNotes = "另一份备注"
    await nextTick()
    // When
    await page.retryHealthNotes()
    // Then
    expect(calls.authorize.mock.calls[1]).toEqual(["order", "line-first", { allergies: "", medicalNotes: "备注-first", emergencyMedicine: "" }, "first-token"])
    expect(page.order.value?.id).toBe("order")
    expect(calls.submitEnrollment).toHaveBeenCalledTimes(1)
  })

  it("clears health consent when changing trip but keeps optional text in the draft", async () => {
    // Given
    const page = await preparedPage()
    // When
    page.draft.selectedTourSessionId = "another-trip"
    await nextTick()
    // Then
    expect(page.draft.familyMembers.every((member) => member.healthConsent === false)).toBe(true)
    expect(page.draft.familyMembers[0]?.healthNotes).toBe("备注-first")
  })

  it("does not send a deselected person's health notes", async () => {
    // Given
    const page = await preparedPage()
    page.toggleMember("second")
    await nextTick()
    // When
    await page.submitEnrollment()
    // Then
    expect(calls.authorize.mock.calls.map((call) => call[1])).toEqual(["line-first"])
  })

  it("removes local health notes with a removed draft participant", async () => {
    // Given
    const page = await preparedPage()
    const second = page.draft.familyMembers[1]
    if (second === undefined) throw new Error("Missing member")
    second.fromCommonList = false
    // When
    page.removeMember("second")
    await nextTick()
    await page.submitEnrollment()
    // Then
    expect(page.draft.familyMembers.map((member) => member.id)).toEqual(["first"])
    expect(calls.authorize.mock.calls.map((call) => call[1])).toEqual(["line-first"])
  })

  it("keeps health input and its separate consent when a guest cancels identity confirmation", async () => {
    // Given
    const page = await preparedPage()
    page.authenticated.value = false
    page.pageMode.value = "editing"
    page.enterReview()
    // When
    page.cancelLogin()
    // Then
    expect(page.draft.familyMembers[0]).toMatchObject({ healthNotes: "备注-first", healthConsent: true })
    expect(calls.authorize).not.toHaveBeenCalled()
    expect(calls.submitEnrollment).not.toHaveBeenCalled()
  })

  it("does not guess a same-name match when a member ID is missing from order details", async () => {
    // Given
    const page = await preparedPage()
    const detail = await calls.getOrderDetail()
    calls.getOrderDetail.mockResolvedValue({ ...detail, participants: detail.participants.filter((line) => line.familyMemberId !== "first") })
    // When
    await page.submitEnrollment()
    // Then
    expect(calls.authorize).not.toHaveBeenCalled()
    expect(page.healthState.value).toBe("error")
    expect(page.pageMode.value).toBe("paymentPending")
    expect(page.order.value?.id).toBe("order")
  })

  it("uses the newly created member ID and excludes health from the ordinary member request", async () => {
    // Given
    const page = await preparedPage()
    const first = page.draft.familyMembers[0]
    if (first === undefined) throw new Error("Missing member")
    delete first.remoteMemberId
    delete first.fromCommonList
    first.participantKind = "adult"
    first.identityNumber = "110105201001010010"
    const detail = await calls.getOrderDetail()
    calls.getOrderDetail.mockResolvedValue({ ...detail, participants: detail.participants.map((line) => line.familyMemberId === "first" ? { ...line, familyMemberId: "new-member" } : line) })
    await nextTick()
    // When
    await page.submitEnrollment()
    // Then
    expect(first.remoteMemberId).toBe("new-member")
    expect(calls.authorize.mock.calls[0]?.[1]).toBe("line-first")
    expect(JSON.stringify(calls.createEnrollmentMember.mock.calls)).not.toContain("health")
    expect(JSON.stringify(calls.createEnrollmentMember.mock.calls)).not.toContain("备注-")
  })

  it("retains earlier member creation if creating the next member fails before enrollment", async () => {
    // Given
    const page = await preparedPage()
    for (const member of page.draft.familyMembers) {
      delete member.remoteMemberId
      delete member.fromCommonList
      member.participantKind = "adult"
      member.identityNumber = "110105201001010010"
    }
    calls.createEnrollmentMember.mockResolvedValueOnce({ id: "first" }).mockRejectedValueOnce(new ApiError(500, "失败"))
    await nextTick()
    // When
    await page.submitEnrollment()
    // Then
    expect(page.draft.familyMembers[0]?.remoteMemberId).toBe("first")
    expect(page.draft.familyMembers[1]?.remoteMemberId).toBeUndefined()
    expect(calls.submitEnrollment).not.toHaveBeenCalled()
    expect(page.pageMode.value).toBe("review")
  })

  it("ignores a repeated retry tap while health saving is in progress", async () => {
    // Given
    const page = await preparedPage()
    calls.authorize.mockRejectedValueOnce(new ApiError(500, "失败"))
    await page.submitEnrollment()
    let release: () => void = () => undefined
    const pending = new Promise<void>((resolve) => { release = resolve })
    calls.authorize.mockReturnValueOnce(pending)
    // When
    const firstRetry = page.retryHealthNotes()
    await page.retryHealthNotes()
    release()
    await firstRetry
    // Then
    expect(calls.authorize.mock.calls.map((call) => call[1])).toEqual(["line-first", "line-first", "line-second"])
    expect(calls.createOrder).toHaveBeenCalledTimes(1)
    expect(calls.submitEnrollment).toHaveBeenCalledTimes(1)
  })
})
