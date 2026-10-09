import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createRenderer, nextTick } from "vue"
import { useEnrollmentPage } from "../src/pages/index/useEnrollmentPage"
import { getWechatSessionPhoneVerified, saveEnrollmentDraftIdentity, saveWechatSessionPhoneVerified, saveWechatSessionToken, clearWechatSessionToken } from "../src/wechat-token"
import { ApiError, type SavedEnrollmentMember } from "../src/api"

const hooks = vi.hoisted(() => ({ load: (query: Record<string, string>) => { void query }, show: () => {}, hide: () => {}, unload: () => {} }))
const showHooks = vi.hoisted(() => [] as (() => void)[])
const calls = vi.hoisted(() => ({ listMembers: vi.fn<() => Promise<readonly SavedEnrollmentMember[]>>() }))
vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (callback: typeof hooks.load) => { hooks.load = callback },
  onShow: (callback: typeof hooks.show) => { showHooks.push(callback); hooks.show = () => { for (const hook of showHooks) hook() } },
  onHide: (callback: typeof hooks.hide) => { hooks.hide = callback },
  onUnload: (callback: typeof hooks.unload) => { hooks.unload = callback },
}))
vi.mock("../src/api", async (original) => ({
  ...await original<typeof import("../src/api")>(),
  createMiniappApi: () => ({
    listCatalogItems: async () => [{ id: "activity", organizationId: "school", status: "active" }],
    listSchools: async () => [{ id: "school", code: "school", name: "学校" }],
    listTourSessions: async () => ["trip-a", "trip-b"].map(id => ({ id, organizationId: "school", catalogItemId: "activity", code: id, status: "published", priceFen: 100, capacity: 30,
      startsAt: "2099-01-01T00:00:00Z", endsAt: "2099-01-02T00:00:00Z", enrollmentOpensAt: "2020-01-01T00:00:00Z", enrollmentClosesAt: "2098-12-31T00:00:00Z",
      activeNotice: { id: "notice", version: "v1" } })),
    listGrades: async () => [{ id: "grade", organizationId: "school", name: "年级", code: "grade" }, { id: "grade-other", organizationId: "school", name: "其他年级", code: "grade-other" }],
    listClasses: async (gradeId: string) => [{ id: gradeId === "grade" ? "class" : "class-other", gradeId, name: "班级", code: "class" }],
    listEnrollmentMembers: calls.listMembers, getCapabilities: async () => ({}),
    checkEnrollmentAvailability: async () => undefined,
    submitEnrollment: async () => ({ id: "enrollment", status: "submitted" }),
    createOrder: async () => ({ id: "order", code: "ORDER", enrollmentId: "enrollment", status: "pending_payment", amountFen: 100, paidFen: 0, payerName: "家长", participantCount: 1 }),
  }),
}))
const storage = new Map<string, unknown>()
const apps: { unmount: () => void }[] = []
const renderer = createRenderer<object, object>({
  patchProp: () => {}, insert: () => {}, remove: () => {}, createElement: () => ({}),
  createText: () => ({}), createComment: () => ({}), setText: () => {}, setElementText: () => {},
  parentNode: () => null, nextSibling: () => null,
})
async function mountPage(sessionId = "trip-a") {
  showHooks.length = 0
  let page: ReturnType<typeof useEnrollmentPage> | undefined
  const app = renderer.createApp({ setup() { page = useEnrollmentPage(); hooks.load({ sessionId }); return () => null } })
  app.mount({})
  apps.push(app)
  await nextTick()
  await nextTick()
  await new Promise<void>(resolve => setImmediate(resolve))
  if (page === undefined) throw new Error("Page did not mount")
  return { page, app }
}
beforeEach(() => {
  storage.clear()
  storage.set("linan_service_consent", { version: "2026-10-09.1", choice: "accepted" })
  calls.listMembers.mockReset().mockResolvedValue([])
  vi.stubGlobal("uni", { getStorageSync: (key: string) => storage.get(key), setStorageSync: (key: string, value: unknown) => storage.set(key, value), removeStorageSync: (key: string) => storage.delete(key) })
})
afterEach(() => { for (const app of apps) app.unmount(); apps.length = 0; vi.unstubAllGlobals() })

it("selects the requested tour on first entry without restoring an empty draft over it", async () => {
  const { page } = await mountPage("trip-a")
  expect(page.draft.selectedTourSessionId).toBe("trip-a")
  expect(page.draft.selectedSchoolId).toBe("school")
  expect(page.draftStatus.value).toBe("")
})

it("keeps the guest draft when returning from background during post-login subscription choice", async () => {
  // Given: a guest has filled the enrollment before the login succeeds.
  const { page } = await mountPage()
  page.loginRequested.value = true
  Object.assign(page.draft, { contactName: "保留家长", selectedGradeId: "grade", selectedClassId: "class" })
  saveWechatSessionToken("logged-in")
  saveEnrollmentDraftIdentity("logged-in", "family-a")
  // When: the identity is established, but the subscription decision is still pending.
  page.adoptLoginDraft()
  hooks.hide()
  hooks.show()
  await nextTick()
  // Then: the prompt and current input survive; skip can complete the original login.
  expect(page.draft.contactName).toBe("保留家长")
  expect(page.draft.selectedGradeId).toBe("grade")
  expect(page.draft.selectedClassId).toBe("class")
  expect(page.loginRequested.value).toBe(true)
  await page.completeLogin()
  expect(page.authenticated.value).toBe(true)
  expect(page.loginRequested.value).toBe(false)
  expect(page.draft.contactName).toBe("保留家长")
})

it("keeps the current guest draft when the same family already has a saved draft", async () => {
  const { page } = await mountPage()
  page.draft.contactName = "访客当前填写"
  hooks.hide()
  const guestKey = "linan_enrollment_draft_v1:guest:trip-a"
  const familyDraft = JSON.parse(String(storage.get(guestKey))) as { contactName: string }
  familyDraft.contactName = "家庭已保存填写"
  storage.set("linan_enrollment_draft_v1:family%3Afamily-a:trip-a", JSON.stringify(familyDraft))
  saveWechatSessionToken("logged-in")
  saveEnrollmentDraftIdentity("logged-in", "family-a")

  page.adoptLoginDraft()

  expect(page.draft.contactName).toBe("访客当前填写")
  expect(storage.get(guestKey)).toBeDefined()
})

it("restores phone verification when the same token rebuilds the enrollment page", async () => {
  saveWechatSessionToken("verified-token")
  saveEnrollmentDraftIdentity("verified-token", "family-a")
  saveWechatSessionPhoneVerified("verified-token", true)
  const first = await mountPage()
  expect(first.page.phoneVerified.value).toBe(true)
  first.app.unmount()

  const second = await mountPage()

  expect(second.page.phoneVerified.value).toBe(true)
})

it("does not transfer phone verification when the bearer token changes", async () => {
  saveWechatSessionToken("verified-token")
  saveWechatSessionPhoneVerified("verified-token", true)
  saveWechatSessionToken("ordinary-token")
  saveEnrollmentDraftIdentity("ordinary-token", "family-a")

  const current = await mountPage()

  expect(getWechatSessionPhoneVerified()).toBe(false)
  expect(current.page.phoneVerified.value).toBe(false)
})

it("restores incomplete entries after hide, unmount and remount without renewing consent", async () => {
  // Given
  const first = await mountPage()
  Object.assign(first.page.draft, { contactName: "草稿家长", contactPhone: "138", selectedGradeId: "grade", selectedClassId: "class", agreementAccepted: true })
  first.page.draft.familyMembers.push({ id: "local", code: "local", displayName: "未填完", selected: true, identityNumber: "110", healthNotes: "花生过敏", healthConsent: true })
  // When
  hooks.hide()
  hooks.unload()
  first.app.unmount()
  const second = await mountPage()
  // Then
  expect(second.page.draft).toMatchObject({ contactName: "草稿家长", contactPhone: "138", selectedGradeId: "grade", selectedClassId: "class", agreementAccepted: false })
  expect(second.page.draft.familyMembers[0]).toMatchObject({ identityNumber: "110", healthNotes: "花生过敏", healthConsent: false })
  expect(second.page.draftStatus.value).toBe("")
})

it("keeps successful saves quiet and reports storage failures", async () => {
  const current = await mountPage()
  current.page.draft.contactName = "已保存"
  expect(current.page.draftStatus.value).toBe("")
  vi.spyOn(uni, "setStorageSync").mockImplementationOnce(() => { throw new Error("空间不足") })
  current.page.draft.contactName = "保存失败"
  expect(current.page.draftStatus.value).toBe("草稿未能保存")
  expect(current.page.errorMessage.value).toContain("空间不足")
})

it("keeps a storage failure available after a grade change clears the general form error", async () => {
  // Given: local storage cannot save the next edit.
  const { page } = await mountPage()
  vi.spyOn(uni, "setStorageSync").mockImplementation(() => { throw new Error("空间不足") })
  // When: changing the grade runs synchronous persistence then resets the form error.
  await page.onGradeChange({ detail: { value: 0 } })
  // Then: the dedicated failure remains available to the page until a successful save.
  expect(page.errorMessage.value).toBe("")
  expect(page.draftStatus.value).toBe("草稿未能保存")
})

it("requires confirmation, clears only this draft, and saves newly filled information", async () => {
  const current = await mountPage()
  current.page.draft.contactName = "清除前"
  current.page.draft.familyMembers.push({ id: "common", code: "common", displayName: "常用人", remoteMemberId: "common", fromCommonList: true, selected: true, healthNotes: "本次备注", healthConsent: true })
  const otherTrip = "linan_enrollment_draft_v1:guest:trip-b"
  const otherOwner = "linan_enrollment_draft_v1:another-account:trip-a"
  storage.set(otherTrip, "other trip")
  storage.set(otherOwner, "other account")
  let modal: UniNamespace.ShowModalOptions | undefined
  Object.assign(uni, { showModal: (options: UniNamespace.ShowModalOptions) => { modal = options } })
  current.page.clearCurrentDraft()
  expect(current.page.draft.contactName).toBe("清除前")
  modal?.success?.({ confirm: false, cancel: true })
  expect(current.page.draft.contactName).toBe("清除前")
  current.page.clearCurrentDraft()
  modal?.success?.({ confirm: true, cancel: false })
  expect(current.page.draft.contactName).toBe("")
  expect(current.page.draft.agreementAccepted).toBe(false)
  expect(current.page.draft.familyMembers).toMatchObject([{ id: "common", selected: false, healthNotes: "", healthConsent: false }])
  expect(current.page.draftStatus.value).toBe("")
  await nextTick()
  hooks.hide()
  expect(storage.has("linan_enrollment_draft_v1:guest:trip-a")).toBe(false)
  expect(storage.get(otherTrip)).toBe("other trip")
  expect(storage.get(otherOwner)).toBe("other account")
  current.page.toggleMember("common")
  expect(current.page.selectedMembers.value).toHaveLength(1)
  current.page.draft.contactName = "重新填写"
  expect(current.page.draftStatus.value).toBe("")
  current.app.unmount()
  expect((await mountPage()).page.draft.contactName).toBe("重新填写")
})

it("keeps the form when clearing device storage fails", async () => {
  const current = await mountPage()
  current.page.draft.contactName = "保留填写"
  Object.assign(uni, { showModal: (options: UniNamespace.ShowModalOptions) => options.success?.({ confirm: true, cancel: false }) })
  vi.spyOn(uni, "removeStorageSync").mockImplementationOnce(() => { throw new Error("无法清除") })
  current.page.clearCurrentDraft()
  expect(current.page.draft.contactName).toBe("保留填写")
  expect(current.page.errorMessage.value).toContain("草稿未能清除")
})

it("ignores an old clear confirmation after the account changes", async () => {
  const current = await mountPage()
  current.page.draft.contactName = "原账户"
  let modal: UniNamespace.ShowModalOptions | undefined
  Object.assign(uni, { showModal: (options: UniNamespace.ShowModalOptions) => { modal = options } })
  current.page.clearCurrentDraft()
  storage.set("linan_wechat_session_token", "new-account")
  modal?.success?.({ confirm: true, cancel: false })
  expect(current.page.draft.contactName).toBe("原账户")
  expect(storage.has("linan_enrollment_draft_v1:guest:trip-a")).toBe(true)
})

it("shows restore failure without claiming that the draft was recovered", async () => {
  storage.set("linan_enrollment_draft_v1:guest:trip-a", "invalid json")
  const current = await mountPage()
  expect(current.page.draftStatus.value).not.toBe("草稿已恢复")
  expect(current.page.draft.contactName).toBe("")
})

it("keeps separate drafts when another tour is opened", async () => {
  // Given
  const first = await mountPage()
  first.page.draft.contactName = "A团家长"
  hooks.hide()
  first.app.unmount()
  // When
  const second = await mountPage("trip-b")
  // Then
  expect(second.page.draft.contactName).toBe("")
})

it("does not show the previous account's entries after token change on a retained page", async () => {
  // Given
  storage.set("linan_wechat_session_token", "account-a")
  const first = await mountPage()
  first.page.draft.contactName = "A账户家长"
  hooks.hide()
  // When
  storage.set("linan_wechat_session_token", "account-b")
  hooks.show()
  await nextTick()
  // Then
  expect(first.page.draft.contactName).toBe("")
})

it("restores the same family's draft after logout and a new login token", async () => {
  // Given
  saveWechatSessionToken("old-token")
  saveEnrollmentDraftIdentity("old-token", "family-a")
  const first = await mountPage()
  first.page.draft.contactName = "同一家庭"
  hooks.hide()
  clearWechatSessionToken()
  hooks.show()
  expect(first.page.draft.contactName).toBe("")
  // When
  saveWechatSessionToken("new-token")
  saveEnrollmentDraftIdentity("new-token", "family-a")
  await first.page.completeLogin()
  // Then
  expect(first.page.draft.contactName).toBe("同一家庭")
})

it("recovers the most recently edited tour when opening enrollment without a route parameter", async () => {
  // Given
  const first = await mountPage()
  first.page.draft.contactName = "最近草稿"
  hooks.hide()
  first.app.unmount()
  // When
  const second = await mountPage("")
  // Then
  expect(second.page.draft.contactName).toBe("最近草稿")
})

it("writes the latest character synchronously before a page is terminated", async () => {
  // Given
  const first = await mountPage()
  first.page.draft.contactPhone = "1390"
  // When: no hide/unload event is delivered before destruction.
  first.app.unmount()
  const second = await mountPage()
  // Then
  expect(second.page.draft.contactPhone).toBe("1390")
})

it("clears the submitted draft without recreating it on page hide", async () => {
  // Given
  const first = await mountPage()
  Object.assign(first.page.draft, { contactName: "家长", contactPhone: "13800000000", familyMembers: [{ id: "saved", code: "saved", remoteMemberId: "saved", displayName: "学生", selected: true, fromCommonList: true }] })
  await nextTick()
  first.page.draft.agreementAccepted = true
  first.page.pageMode.value = "review"
  expect(first.page.canSubmit.value).toBe(true)
  // When
  await first.page.submitEnrollment()
  expect(first.page.order.value?.id).toBe("order")
  hooks.hide()
  first.app.unmount()
  const second = await mountPage()
  // Then
  expect(second.page.draft.contactName).toBe("")
  expect(second.page.draft.familyMembers).toEqual([])
})

it("loads the public form when the authenticated catalog request expires and clears its token", async () => {
  // Given
  saveWechatSessionToken("expired-token")
  saveEnrollmentDraftIdentity("expired-token", "family-a")
  saveWechatSessionPhoneVerified("expired-token", true)
  calls.listMembers.mockImplementationOnce(async () => {
    clearWechatSessionToken()
    throw new ApiError(401, "Expired session")
  })
  // When
  const current = await mountPage()
  // Then
  expect(current.page.loadState.value).toBe("ready")
  expect(current.page.authenticated.value).toBe(false)
  expect(current.page.phoneVerified.value).toBe(false)
})

it("shows the login failure when completing login returns 401 and clears the current token", async () => {
  // Given
  saveWechatSessionToken("login-token")
  saveEnrollmentDraftIdentity("login-token", "family-a")
  const current = await mountPage()
  current.page.draft.contactName = "未完成家长"
  calls.listMembers.mockImplementationOnce(async () => {
    clearWechatSessionToken()
    throw new ApiError(401, "登录已过期，请重新登录")
  })
  // When
  await current.page.completeLogin()
  // Then
  expect(current.page.authenticated.value).toBe(false)
  expect(current.page.loginRequested.value).toBe(true)
  expect(current.page.errorMessage.value).toBe("登录已过期，请重新登录")
  expect(current.page.draft.contactName).toBe("未完成家长")
})

it("keeps the selected school when an unfinished draft has no tour yet", async () => {
  // Given
  const current = await mountPage("")
  current.page.catalog.schools.push({ id: "other-school", code: "other-school", name: "另一学校" })
  await current.page.onSchoolChange({ detail: { value: 0 } })
  // When
  await current.page.onSchoolChange({ detail: { value: 1 } })
  // Then
  expect(current.page.draft.selectedSchoolId).toBe("other-school")
  expect(current.page.draft.selectedTourSessionId).toBe("")
})

it("restores valid grade and class after switching between differently restricted tours", async () => {
  // Given
  const current = await mountPage()
  current.page.catalog.sessions = current.page.catalog.sessions.map(session => ({ ...session,
    enrollmentScope: [{ gradeId: session.id === "trip-a" ? "grade" : "grade-other", classIds: null }],
  }))
  await current.page.onSessionChange({ detail: { value: 0 } })
  await current.page.onGradeChange({ detail: { value: 0 } })
  current.page.onClassChange({ detail: { value: 0 } })
  await current.page.onSessionChange({ detail: { value: 1 } })
  await current.page.onGradeChange({ detail: { value: 0 } })
  current.page.onClassChange({ detail: { value: 0 } })
  await current.page.onSessionChange({ detail: { value: 0 } })
  // When
  await current.page.onSessionChange({ detail: { value: 1 } })
  // Then
  expect(current.page.draft.selectedGradeId).toBe("grade-other")
  expect(current.page.draft.selectedClassId).toBe("class-other")
})
