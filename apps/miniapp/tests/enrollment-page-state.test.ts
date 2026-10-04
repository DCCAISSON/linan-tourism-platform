import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { effectScope, nextTick, type EffectScope } from "vue"
import { DOMAIN_POLICY_VERSION } from "@linan/contracts"
import type { TourSession, SavedEnrollmentMember, CreateOrderPayload, Order, Grade, SchoolClass } from "../src/api"
import { useEnrollmentPage } from "../src/pages/index/useEnrollmentPage"
import { ApiError } from "../src/api"

vi.mock("vue", async (importOriginal) => ({ ...await importOriginal<typeof import("vue")>(), onMounted: () => undefined }))
vi.mock("@dcloudio/uni-app", () => ({ onLoad: () => undefined, onShow: () => undefined, onHide: () => undefined, onUnload: () => undefined }))
const apiCalls = vi.hoisted(() => ({
  listGrades: vi.fn<(schoolId: string) => Promise<readonly Grade[]>>(),
  listClasses: vi.fn<(gradeId: string) => Promise<readonly SchoolClass[]>>(),
  listEnrollmentMembers: vi.fn<() => Promise<readonly SavedEnrollmentMember[]>>(),
  updateEnrollmentMember: vi.fn(async (memberId: string, payload: { readonly displayName: string }) => ({ id: memberId, code: memberId, displayName: payload.displayName })),
  submitEnrollment: vi.fn(async () => ({ id: "enrollment-one", status: "submitted" })),
  createOrder: vi.fn<(payload: CreateOrderPayload) => Promise<Order>>(),
  getOrder: vi.fn<(orderId: string) => Promise<Order>>(),
}))
const serviceConsent = vi.hoisted(() => ({ hasServiceConsent: vi.fn(() => true) }))
beforeEach(() => {
  vi.resetAllMocks()
  serviceConsent.hasServiceConsent.mockReturnValue(true)
  apiCalls.listGrades.mockResolvedValue([])
  apiCalls.listClasses.mockResolvedValue([])
  apiCalls.submitEnrollment.mockResolvedValue({ id: "enrollment-one", status: "submitted" })
  apiCalls.listEnrollmentMembers.mockResolvedValue([])
  apiCalls.updateEnrollmentMember.mockImplementation(async (memberId, payload) => ({ id: memberId, code: memberId, displayName: payload.displayName }))
  apiCalls.createOrder.mockResolvedValue({ id: "order-one", code: "ORDER", enrollmentId: "enrollment-one", status: "pending_payment", amountFen: 100, paidFen: 0, payerName: "家长", participantCount: 1 })
})
vi.mock("../src/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/api")>(),
  createMiniappApi: () => ({ ...apiCalls, checkEnrollmentAvailability: async () => undefined }),
}))
vi.mock("../src/service-consent", () => serviceConsent)
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
  it("returns to editing and clears the checkout when the order was cancelled from its detail page", async () => {
    const page = pageState()
    const order: Order = { id: "cancelled-order", code: "ORDER", enrollmentId: "old-enrollment", status: "pending_payment", amountFen: 100, paidFen: 0, payerName: "家长", participantCount: 1 }
    page.order.value = order
    page.pageMode.value = "paymentPending"
    page.submissionCode.value = "old-enrollment"
    apiCalls.getOrder.mockResolvedValue({ ...order, status: "cancelled" })
    await page.refreshOrder()
    expect(page.order.value).toBeNull()
    expect(page.submissionCode.value).toBe("")
    expect(page.pageMode.value).toBe("editing")
    expect(page.errorMessage.value).toBe("原订单已取消，可重新核对信息并报名。")
  })
  it("opens identity login before privacy when a guest starts reviewing enrollment", () => {
    const page = pageState()
    page.authenticated.value = false
    serviceConsent.hasServiceConsent.mockReturnValue(false)
    page.enterReview()
    expect(page.loginPromptVisible.value).toBe(true)
    expect(page.serviceConsentVisible.value).toBe(false)
    expect(page.pageMode.value).toBe("editing")
  })

  it("keeps the draft visible when common consent is still required", () => {
    const page = pageState()
    serviceConsent.hasServiceConsent.mockReturnValue(false)

    page.enterReview()

    expect(page.serviceConsentVisible.value).toBe(true)
    expect(page.pageMode.value).toBe("editing")
  })

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
  it("edits the saved participant name and keeps the selected member in the draft", async () => {
    const page = pageState()
    page.draft.familyMembers = [{ id: "saved", remoteMemberId: "saved", fromCommonList: true, code: "saved", displayName: "旧姓名", selected: true }]

    await page.updateSavedMemberName("saved", "新姓名")

    expect(apiCalls.updateEnrollmentMember).toHaveBeenCalledWith("saved", { displayName: "新姓名" })
    expect(page.draft.familyMembers[0]).toMatchObject({ displayName: "新姓名", selected: true })
  })

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

function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("Promise not initialized") }
  let reject: (reason: Error) => void = () => { throw new Error("Promise not initialized") }
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}
const schoolOptions = [
  { id: "school-a", code: "A", name: "本地学校甲" },
  { id: "school-b", code: "B", name: "本地学校乙" },
]
function gradesFor(schoolId: string): Grade[] {
  return [1, 2].map((number) => ({ id: `${schoolId}-g${number}`, organizationId: schoolId, code: `G${number}`, name: `${number}年级` }))
}
function classesFor(gradeId: string): SchoolClass[] {
  return [1, 2].map((number) => ({ id: `${gradeId}-c${number}`, gradeId, code: `C${number}`, name: `${number}班` }))
}

describe("enrollment option requests", () => {
  it("keeps the latest school options when an earlier request resolves last", async () => {
    // Given
    const page = pageState()
    page.catalog.schools = schoolOptions
    const first = deferred<readonly Grade[]>()
    apiCalls.listGrades.mockImplementation((schoolId) => schoolId === "school-a" ? first.promise : Promise.resolve(gradesFor(schoolId)))
    const previous = page.onSchoolChange({ detail: { value: 0 } })
    // When
    await page.onSchoolChange({ detail: { value: "1" } })
    first.resolve(gradesFor("school-a"))
    await previous
    // Then
    expect(page.catalog.grades).toEqual(gradesFor("school-b"))
    expect(page.draft.selectedGradeId).toBe("")
    expect(page.gradeState.value).toBe("ready")
    expect(page.schoolIndex.value).toBe(1)
  })

  it("keeps the latest class options when an earlier grade request resolves last", async () => {
    // Given
    const page = pageState()
    page.catalog.grades = gradesFor("school-a")
    const first = deferred<readonly SchoolClass[]>()
    apiCalls.listClasses.mockImplementation((gradeId) => gradeId.endsWith("g1") ? first.promise : Promise.resolve(classesFor(gradeId)))
    const previous = page.onGradeChange({ detail: { value: 0 } })
    // When
    await page.onGradeChange({ detail: { value: 1 } })
    first.resolve(classesFor("school-a-g1"))
    await previous
    // Then
    expect(page.catalog.classes).toEqual(classesFor("school-a-g2"))
    expect(page.draft.selectedClassId).toBe("")
    expect(page.gradeIndex.value).toBe(1)
  })

  it("clears dependent choices and rejects pending classes when changing school", async () => {
    // Given
    const page = pageState()
    page.catalog.schools = schoolOptions
    page.catalog.grades = gradesFor("school-a")
    const classes = deferred<readonly SchoolClass[]>()
    apiCalls.listClasses.mockReturnValue(classes.promise)
    page.draft.selectedSchoolId = "school-a"
    const previous = page.onGradeChange({ detail: { value: 0 } })
    Object.assign(page.draft, { selectedClassId: "old-class", selectedTourSessionId: "old-session", agreementAccepted: true })
    page.submissionCode.value = "old-submission"
    // When
    await page.onSchoolChange({ detail: { value: 1 } })
    classes.resolve(classesFor("school-a-g1"))
    await previous
    // Then
    expect(page.catalog.classes).toEqual([])
    expect(page.classState.value).toBe("idle")
    expect(page.draft).toMatchObject({ selectedGradeId: "", selectedClassId: "", selectedTourSessionId: "", agreementAccepted: false })
    expect(page.submissionCode.value).toBe("")
  })

  it("ignores an old failure while the current school is loading", async () => {
    // Given
    const page = pageState()
    page.catalog.schools = schoolOptions
    const first = deferred<readonly Grade[]>()
    const second = deferred<readonly Grade[]>()
    apiCalls.listGrades.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const previous = page.onSchoolChange({ detail: { value: 0 } })
    const current = page.onSchoolChange({ detail: { value: 1 } })
    // When
    first.reject(new Error("old request failed"))
    await previous
    // Then
    expect(page.gradeState.value).toBe("loading")
    expect(page.gradeError.value).toBe("")
    second.resolve([])
    await current
  })

  it("retries a failed grade request and leaves the returned choices unselected", async () => {
    // Given
    const page = pageState()
    page.catalog.schools = schoolOptions
    apiCalls.listGrades.mockRejectedValueOnce(new Error("网络暂不可用"))
    await page.onSchoolChange({ detail: { value: 1 } })
    expect(page.gradeState.value).toBe("error")
    expect(page.gradeError.value).toBe("网络暂不可用")
    apiCalls.listGrades.mockResolvedValue(gradesFor("school-b"))
    // When
    await page.retryGrades()
    // Then
    expect(page.gradeState.value).toBe("ready")
    expect(page.gradeError.value).toBe("")
    expect(page.catalog.grades).toHaveLength(2)
    expect(page.draft.selectedGradeId).toBe("")
  })

  it("distinguishes an empty class response from a failed request after retry", async () => {
    // Given
    const page = pageState()
    page.catalog.grades = gradesFor("school-a")
    apiCalls.listClasses.mockRejectedValueOnce(new Error("连接失败"))
    await page.onGradeChange({ detail: { value: 1 } })
    expect(page.classState.value).toBe("error")
    // When
    await page.retryClasses()
    // Then
    expect(page.classState.value).toBe("empty")
    expect(page.classError.value).toBe("")
    expect(page.draft.selectedClassId).toBe("")
  })

  it("selects every second option using server IDs and keeps each school's session price", async () => {
    // Given: fixture data are local only, never written to the public API.
    const page = pageState()
    page.catalog.schools = schoolOptions
    page.catalog.sessions = schoolOptions.map((school, index) => ({ ...session(`session-${school.id}`), organizationId: school.id, priceFen: 100 + index * 100 }))
    apiCalls.listGrades.mockImplementation(async (schoolId) => gradesFor(schoolId))
    apiCalls.listClasses.mockImplementation(async (gradeId) => classesFor(gradeId))
    // When
    await page.onSchoolChange({ detail: { value: 1 } })
    await page.onGradeChange({ detail: { value: 1 } })
    page.onClassChange({ detail: { value: 1 } })
    await page.onSessionChange({ detail: { value: 0 } })
    // Then
    expect(page.draft).toMatchObject({ selectedSchoolId: "school-b", selectedGradeId: "school-b-g2", selectedClassId: "school-b-g2-c2", selectedTourSessionId: "session-school-b" })
    expect(page.classIndex.value).toBe(1)
    expect(page.availableSessions.value.map((item) => item.priceFen)).toEqual([200])
    expect(page.selectedSession.value?.priceFen).toBe(200)
  })
})

describe("enrollment action login prompt", () => {
  it("clears saved private members and keeps local input when login refresh returns 401", async () => {
    // Given
    const page = pageState()
    page.draft.contactName = "家长甲"
    page.draft.familyMembers = [
      { id: "saved", code: "saved", displayName: "常用成员", fromCommonList: true, remoteMemberId: "saved", selected: false },
      { id: "selected-saved", code: "selected-saved", displayName: "本次已选成员", fromCommonList: true, remoteMemberId: "selected-saved", selected: true },
      { id: "local", code: "local", displayName: "本次成员", selected: true },
    ]
    page.phoneVerified.value = true
    apiCalls.listEnrollmentMembers.mockRejectedValue(new ApiError(401, "登录已过期，请重新登录"))
    // When
    await page.completeLogin()
    await nextTick()
    // Then
    expect(page.authenticated.value).toBe(false)
    expect(page.phoneVerified.value).toBe(false)
    expect(page.draft.familyMembers.map((member) => member.displayName)).toEqual(["本次已选成员", "本次成员"])
    expect(page.draft.familyMembers[0]?.id).not.toBe("selected-saved")
    expect(page.draft.familyMembers[0]?.remoteMemberId).toBeUndefined()
    expect(page.draft.familyMembers[0]?.fromCommonList).toBeUndefined()
    expect(page.draft.familyMembers[0]?.identityNumber).toBe("")
    expect(page.draft.contactName).toBe("家长甲")
    expect(page.loginPromptVisible.value).toBe(false)
    expect(page.loginRequested.value).toBe(true)
    expect(page.errorMessage.value).toBe("登录已过期，请重新登录")
  })

  it("clears an earlier phone verification after ordinary WeChat login returns no verification", async () => {
    const page = pageState()
    page.phoneVerified.value = true

    await page.completeLogin({ token: "ordinary", familyCode: "family", expiresAt: "2026-10-02T00:00:00.000Z" })

    expect(page.phoneVerified.value).toBe(false)
  })

  it("removes unselected historical members after a submission 401 while retaining the chosen draft", async () => {
    // Given
    const page = pageState()
    page.catalog.schools = [{ id: "school", code: "school", name: "学校" }]
    page.catalog.sessions = [session("first")]
    Object.assign(page.draft, { selectedSchoolId: "school", selectedTourSessionId: "first", contactName: "家长", contactPhone: "19900003099" })
    apiCalls.listEnrollmentMembers.mockResolvedValue(["selected", "history"].map((id) => ({ id, code: id, displayName: id, participantKind: "student", schoolId: "school", gradeId: "grade", classId: "class" })))
    await page.completeLogin()
    page.toggleMember("selected")
    page.draft.familyMembers.push({ id: "local", code: "local", displayName: "手填草稿", selected: false })
    await nextTick()
    page.draft.agreementAccepted = true
    await nextTick()
    page.pageMode.value = "review"
    apiCalls.submitEnrollment.mockRejectedValueOnce(new ApiError(401, "登录已过期"))
    // When
    await page.submitEnrollment()
    page.cancelLogin()
    await nextTick()
    // Then
    expect(page.authenticated.value).toBe(false)
    expect(page.draft.familyMembers.map((member) => member.displayName)).toEqual(["selected", "手填草稿"])
    expect(page.draft.familyMembers[0]?.remoteMemberId).toBeUndefined()
    expect(page.draft.familyMembers[0]?.fromCommonList).toBeUndefined()
    expect(page.draft.contactName).toBe("家长")
    expect(page.errorMessage.value).toBe("登录已过期")
    await page.onSchoolChange({ detail: { value: 0 } })
    expect(page.draft.familyMembers.map((member) => member.displayName)).toEqual(["selected", "手填草稿"])
    apiCalls.listEnrollmentMembers.mockResolvedValue([{ id: "selected", code: "selected", displayName: "selected", participantKind: "student", schoolId: "school", gradeId: "grade", classId: "class" }])
    await page.completeLogin()
    page.validationShown.value = true
    const selected = page.draft.familyMembers.find((member) => member.selected)
    if (selected === undefined) throw new Error("Selected draft missing")
    expect(selected.remoteMemberId).toBeUndefined()
    expect(new Set(page.draft.familyMembers.map((member) => member.id)).size).toBe(page.draft.familyMembers.length)
    expect(page.memberFieldError(selected, "identityNumber")).not.toBe("")
    page.removeMember(selected.id)
    page.toggleMember("selected")
    expect(page.draft.familyMembers.find((member) => member.id === "selected")).toMatchObject({ remoteMemberId: "selected", selected: true })
  })

  it("keeps the draft and closes the prompt when the guest cancels login", () => {
    // Given
    const page = pageState()
    page.authenticated.value = false
    page.draft.contactName = "家长甲"
    page.requestLogin()
    expect(page.loginPromptVisible.value).toBe(true)
    expect(page.loginRequested.value).toBe(false)
    // When
    page.cancelLogin()
    // Then
    expect(page.loginPromptVisible.value).toBe(false)
    expect(page.loginRequested.value).toBe(false)
    expect(page.draft.contactName).toBe("家长甲")
    expect(apiCalls.listEnrollmentMembers).not.toHaveBeenCalled()
  })

  it("opens the existing consent step only after confirming the login prompt", async () => {
    // Given
    const page = pageState()
    page.authenticated.value = false
    vi.stubGlobal("uni", { pageScrollTo: vi.fn() })
    page.requestLogin()
    // When
    page.confirmLogin()
    await nextTick()
    // Then
    expect(page.loginPromptVisible.value).toBe(false)
    expect(page.loginRequested.value).toBe(true)
    expect(apiCalls.listEnrollmentMembers).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe("session enrollment scope", () => {
  it("filters school grades and classes and clears invalid selections when changing session", async () => {
    const page = pageState()
    page.draft.selectedSchoolId = "school"
    page.catalog.sessions = [session("all"), { ...session("limited"), enrollmentScope: [{ gradeId: "g1", classIds: ["c1"] }] }]
    apiCalls.listGrades.mockResolvedValue([{ id: "g1", organizationId: "school", code: "g1", name: "一年级" }, { id: "g2", organizationId: "school", code: "g2", name: "二年级" }])
    apiCalls.listClasses.mockResolvedValue([{ id: "c1", gradeId: "g1", code: "c1", name: "一班" }, { id: "c2", gradeId: "g1", code: "c2", name: "二班" }])
    await page.onSessionChange({ detail: { value: 0 } })
    await page.onGradeChange({ detail: { value: 0 } })
    page.onClassChange({ detail: { value: 1 } })
    expect(page.draft.selectedClassId).toBe("c2")
    await page.onSessionChange({ detail: { value: 1 } })
    expect(page.catalog.grades.map(item => item.id)).toEqual(["g1"])
    expect(page.catalog.classes.map(item => item.id)).toEqual(["c1"])
    expect(page.draft.selectedClassId).toBe("")
    await page.onSessionChange({ detail: { value: 0 } })
    expect(page.catalog.grades).toHaveLength(2)
    expect(page.catalog.classes).toHaveLength(2)
  })
})
