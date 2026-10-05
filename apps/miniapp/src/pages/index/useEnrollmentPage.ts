import { computed, nextTick, onMounted, reactive, ref, watch } from "vue"
import { onLoad, onShow } from "@dcloudio/uni-app"
import { createContractApi, type OrderContract } from "../../contract-api"
import {
  ApiError, createMiniappApi, type Grade,
  type Order,
  type ServiceCapabilities, type SavedEnrollmentMember, type School, type SchoolClass, type TourSession, type WechatLoginResponse, type WechatMiniappPayment,
} from "../../api"
import { getWechatSessionPhoneVerified, getWechatSessionToken, getEnrollmentDraftOwner } from "../../wechat-token"
import { activeEnrollmentOptions, enrollmentGrades, enrollmentClasses } from "../../activity-catalog"
import {
  buildCreateOrderPayload, canStartPayment, createOrderRequestKey,
  nextPageModeForOrder, orderStatusLabel, readTripGate,
} from "../../checkout-flow"
import {
  buildEnrollmentPayload, createEmptyDraft, optionNames, prepareSelectedMembersForSubmit,
  readEnrollmentReadiness, selectedFamilyMembers, sessionOptionNames,
  type FamilyMember,
  type LoadState, type PageMode,
} from "../../enrollment-flow"
import {
  createLocalMemberCode, readContactFieldError, readFirstEnrollmentInvalidTarget, readMemberFieldError,
  type ContactFieldName, type MemberFieldName,
} from "../../enrollment-validation"
import { readableError, readPickerIndex, readStateTone, stateLabel } from "./page-helpers"
import { canUseWechatPayment, paymentCapabilitiesClosed, paymentUnavailableNotice, wechatPaymentFailureMessage } from "../../payment-policy"
import { useEnrollmentHealth } from "./useEnrollmentHealth"
import { useEnrollmentDraft } from "./useEnrollmentDraft"
import { hasServiceConsent } from "../../service-consent"

export type PickerChangeEvent = {
  readonly detail: {
    readonly value: number | string
  }
}

export function scrollToEnrollmentAnchor(anchor: string): void {
  uni.pageScrollTo({ selector: `#${anchor}`, duration: 200 })
}

export function useEnrollmentPage() {
  let api = createMiniappApi()
  function currentSessionPhoneVerified(): boolean {
    return getWechatSessionToken() === undefined
      ? import.meta.env["VITE_WECHAT_LOGIN_ENABLED"] !== "true"
      : getWechatSessionPhoneVerified()
  }
  const authenticated = ref(import.meta.env["VITE_WECHAT_LOGIN_ENABLED"] !== "true" || getWechatSessionToken() !== undefined)
  const phoneVerified = ref(currentSessionPhoneVerified())
  const loginRequested = ref(false)
  const loginPromptVisible = ref(false)
  const serviceConsentVisible = ref(false)
  let serviceConsentAction: "review" | "submit" | undefined
  let reviewAfterLogin = false
  const validationShown = ref(false)
  const loadState = ref<LoadState>("loading")
  const pageMode = ref<PageMode>("editing")
  const errorMessage = ref("")
  const submissionCode = ref("")
  const currentTimeIso = ref(new Date().toISOString())
  const order = ref<Order | null>(null)
  const contract = ref<OrderContract | null>(null)
  const contractState = ref<"idle" | "loading" | "ready" | "error">("idle")
  const contractPending = computed(() => contract.value?.status === "pending_parent_signature")
  const health = useEnrollmentHealth()
  const payment = ref<WechatMiniappPayment | null>(null)
  const paymentCapabilities = ref<ServiceCapabilities>(paymentCapabilitiesClosed)
  const wantedSessionId = ref("")
  const savedMembers = ref<readonly SavedEnrollmentMember[]>([])
  const savedMemberPlacements = ref<ReadonlyMap<string, { readonly label: string; readonly failed: boolean }>>(new Map())
  const memberPlacementFailed = computed(() => [...savedMemberPlacements.value.values()].some((placement) => placement.failed))
  const memberToEdit = ref<string | null>(null)
  let memberPlacementRequest = 0
  const gradeState = ref<LoadState | "idle">("idle")
  const classState = ref<LoadState | "idle">("idle")
  const gradeError = ref("")
  const classError = ref("")
  let gradeRequest = 0
  let classRequest = 0
  const draft = reactive({
    ...createEmptyDraft(),
    familyMembers: [] as FamilyMember[],
  })
  const catalog = reactive({
    schools: [] as School[],
    grades: [] as Grade[],
    classes: [] as SchoolClass[],
    sessions: [] as TourSession[],
  })
  const persistedDraft = useEnrollmentDraft(draft, message => { errorMessage.value = message }, () => {
    savedMembers.value = []
    savedMemberPlacements.value = new Map()
    memberPlacementRequest++
    memberToEdit.value = null
    const token = getWechatSessionToken()
    authenticated.value = import.meta.env["VITE_WECHAT_LOGIN_ENABLED"] !== "true" || token !== undefined
    phoneVerified.value = currentSessionPhoneVerified()
    api = createMiniappApi()
    order.value = null
    health.captureHealth([])
    resetCheckout()
    pageMode.value = "editing"
  })
  onLoad((query) => {
    wantedSessionId.value = query?.["sessionId"] ?? ""
    persistedDraft.restore(wantedSessionId.value, true)
  })

  const schoolNames = computed(() => optionNames(catalog.schools))
  const gradeNames = computed(() => optionNames(catalog.grades))
  const classNames = computed(() => optionNames(catalog.classes))
  const availableSessions = computed(() =>
    catalog.sessions.filter((session) => session.organizationId === draft.selectedSchoolId),
  )
  const sessionNames = computed(() => sessionOptionNames(availableSessions.value))
  const schoolIndex = computed(() => Math.max(0, catalog.schools.findIndex((item) => item.id === draft.selectedSchoolId)))
  const gradeIndex = computed(() => Math.max(0, catalog.grades.findIndex((item) => item.id === draft.selectedGradeId)))
  const classIndex = computed(() => Math.max(0, catalog.classes.findIndex((item) => item.id === draft.selectedClassId)))
  const sessionIndex = computed(() => Math.max(0, availableSessions.value.findIndex((item) => item.id === draft.selectedTourSessionId)))
  const selectedSchool = computed(() => catalog.schools.find((school) => school.id === draft.selectedSchoolId))
  const selectedGrade = computed(() => catalog.grades.find((grade) => grade.id === draft.selectedGradeId))
  const selectedClass = computed(() => catalog.classes.find((schoolClass) => schoolClass.id === draft.selectedClassId))
  const selectedSession = computed(() => catalog.sessions.find((session) => session.id === draft.selectedTourSessionId))
  const selectedTripGate = computed(() => readTripGate(selectedSession.value, currentTimeIso.value))
  const selectedMembers = computed(() => selectedFamilyMembers(draft.familyMembers))
  const readiness = computed(() => {
    if (draft.selectedTourSessionId.length > 0 && !selectedTripGate.value.open) {
      return { ready: false, reason: selectedTripGate.value.reason }
    }
    return readEnrollmentReadiness(draft)
  })
  const canReview = computed(() => loadState.value === "ready" && pageMode.value === "editing")
  const canSubmit = computed(() => authenticated.value && phoneVerified.value && pageMode.value === "review" && readiness.value.ready)
  const wechatPaymentAvailable = computed(() => canUseWechatPayment({ capabilities: paymentCapabilities.value }))
  const canRetryPayment = computed(() => contractState.value === "ready" && !contractPending.value && health.healthState.value !== "saving" && wechatPaymentAvailable.value && canStartPayment(order.value) && pageMode.value === "paymentPending")
  const loadStateLabel = computed(() => stateLabel(loadState.value, pageMode.value))
  const stateTone = computed(() => readStateTone(loadState.value, pageMode.value))
  const orderLabel = computed(() => orderStatusLabel(order.value))
  onMounted(() => {
    void loadCatalog()
  })
  onShow(() => { if (order.value) void refreshOrder() })

  async function refreshContract(): Promise<boolean> {
    const current = order.value, owner = getEnrollmentDraftOwner(), token = getWechatSessionToken()
    if (!current || contractState.value === "loading") return false
    if (contractState.value === "error") errorMessage.value = ""
    contractState.value = "loading"
    try {
      const result = await createContractApi().getContract(current.id)
      if (owner !== getEnrollmentDraftOwner() || token !== getWechatSessionToken() || order.value?.id !== current.id) return false
      contract.value = result; contractState.value = "ready"
      return result?.status !== "pending_parent_signature"
    } catch (cause) {
      if (owner !== getEnrollmentDraftOwner() || token !== getWechatSessionToken() || order.value?.id !== current.id) return false
      contractState.value = "error"
      errorMessage.value = readableError(cause, "合同加载失败，请重试后继续办理。")
      return false
    }
  }

  function openContract(): void {
    if (order.value) uni.navigateTo({ url: `/pages/orders/contract?orderId=${encodeURIComponent(order.value.id)}` })
  }

  async function loadCatalog(): Promise<void> {
    persistedDraft.pause()
    const loadingOwner = getEnrollmentDraftOwner()
    const loadingToken = getWechatSessionToken()
    gradeRequest++
    classRequest++
    gradeState.value = "idle"
    classState.value = "idle"
    gradeError.value = ""
    classError.value = ""
    loadState.value = "loading"
    pageMode.value = "editing"
    errorMessage.value = ""
    resetCheckout()
    try {
      const [activities, schools, sessions, members, capabilities] = await Promise.all([
        api.listCatalogItems(),
        api.listSchools(),
        api.listTourSessions(),
        authenticated.value ? api.listEnrollmentMembers() : Promise.resolve([]),
        api.getCapabilities(),
      ])
      const options = activeEnrollmentOptions(activities, sessions, schools)
      if (loadingOwner !== getEnrollmentDraftOwner()) return
      savedMembers.value = members
      paymentCapabilities.value = capabilities
      catalog.schools = [...options.schools]
      catalog.sessions = [...options.sessions]
      catalog.grades = []
      catalog.classes = []
      currentTimeIso.value = new Date().toISOString()
      loadState.value = catalog.schools.length === 0 || catalog.sessions.length === 0 ? "empty" : "ready"
      const wantedSession = options.sessions.find((session) => session.id === wantedSessionId.value)
      const schoolIndex = options.schools.findIndex((school) => school.id === wantedSession?.organizationId)
      if (draft.selectedSchoolId) {
        await retryGrades()
        if (draft.selectedGradeId) await retryClasses()
        await retryMemberPlacements()
      } else if (schoolIndex >= 0) await onSchoolChange({ detail: { value: schoolIndex } })
    } catch (error) {
      const sessionExpired = loadingToken !== undefined && getWechatSessionToken() === undefined
      if (authenticated.value && error instanceof ApiError && error.statusCode === 401
        && (loadingToken === getWechatSessionToken() || sessionExpired)) {
        persistedDraft.syncOwner()
        authenticated.value = false
        phoneVerified.value = false
        await loadCatalog()
        return
      }
      if (loadingOwner !== getEnrollmentDraftOwner()) return
      loadState.value = "error"
      errorMessage.value = readableError(error, "报名信息加载失败，请稍后重试")
    } finally {
      persistedDraft.resume()
    }
  }

  async function onSchoolChange(event: PickerChangeEvent): Promise<void> {
    const school = catalog.schools[readPickerIndex(event)]
    if (school === undefined) return
    persistedDraft.save()
    persistedDraft.pause()
    classRequest++
    classState.value = "idle"
    classError.value = ""
    const localMembers = draft.familyMembers.filter((member) => !member.fromCommonList)
    if (draft.selectedSchoolId !== school.id) {
      for (const member of localMembers) delete member.remoteMemberId
    }
    draft.selectedSchoolId = school.id
    draft.selectedGradeId = ""
    draft.selectedClassId = ""
    draft.agreementAccepted = false
    draft.selectedTourSessionId = catalog.sessions.find((session) => session.id === wantedSessionId.value && session.organizationId === school.id)?.id ?? ""
    draft.familyMembers = [
      ...savedMembers.value.filter((member) => member.schoolId === school.id && !localMembers.some((local) => local.remoteMemberId === member.id)).map((member) => ({
        id: member.id,
        code: member.code,
        displayName: member.displayName,
        participantKind: member.participantKind ?? "student",
        identityNumber: member.identityNumberMasked ?? "",
        phone: member.phoneMasked ?? "",
        remoteMemberId: member.id,
        fromCommonList: true,
        selected: draft.familyMembers.find((existing) => existing.remoteMemberId === member.id)?.selected ?? false,
      })),
      ...localMembers,
    ]
    catalog.grades = []
    catalog.classes = []
    resetCheckout()
    errorMessage.value = ""
    persistedDraft.restore(draft.selectedTourSessionId)
    await Promise.all([retryGrades(), retryMemberPlacements()])
  }

  async function retryMemberPlacements(): Promise<void> {
    const request = ++memberPlacementRequest
    const owner = getEnrollmentDraftOwner(), token = getWechatSessionToken(), schoolId = draft.selectedSchoolId
    savedMemberPlacements.value = new Map()
    let schoolGrades: Promise<readonly Grade[]> | undefined
    const classRequests = new Map<string, Promise<readonly SchoolClass[]>>()
    const members = savedMembers.value.filter((member) => member.schoolId === schoolId && member.participantKind !== "adult")
    await Promise.all(members.map(async (member) => {
      let placement: { readonly label: string; readonly failed: boolean }
      try {
        const gradesRequest = member.gradeId === null ? Promise.resolve([]) : schoolGrades ??= api.listGrades(schoolId)
        const classesRequest = member.gradeId === null || member.classId === null ? Promise.resolve([]) : classRequests.get(member.gradeId) ?? api.listClasses(member.gradeId)
        if (member.gradeId !== null && member.classId !== null) classRequests.set(member.gradeId, classesRequest)
        const [grades, classes] = await Promise.all([gradesRequest, classesRequest])
        const grade = member.gradeId === null ? "年级未填写" : grades.find((item) => item.id === member.gradeId)?.name ?? "年级信息待核实"
        const schoolClass = member.classId === null ? "班级未填写" : classes.find((item) => item.id === member.classId)?.name ?? "班级信息待核实"
        placement = { label: `${grade} · ${schoolClass}`, failed: false }
      } catch {
        placement = { label: "班级信息暂未加载", failed: true }
      }
      if (request !== memberPlacementRequest || owner !== getEnrollmentDraftOwner() || token !== getWechatSessionToken() || schoolId !== draft.selectedSchoolId) return
      savedMemberPlacements.value = new Map([...savedMemberPlacements.value, [member.id, placement]])
    }))
  }

  function memberPlacement(member: FamilyMember): string {
    if (member.participantKind === "adult") return "成人 · 无需年级班级"
    if (member.fromCommonList) {
      const saved = savedMembers.value.find((item) => item.id === member.remoteMemberId)
      if (saved === undefined) return "学校班级信息暂未加载"
      const school = catalog.schools.find((item) => item.id === saved.schoolId)?.name ?? "学校信息待核实"
      return `${school} · ${savedMemberPlacements.value.get(saved.id)?.label ?? "班级信息加载中…"}`
    }
    return `${selectedSchool.value?.name ?? "学校待填写"} · ${selectedGrade.value?.name ?? "年级待填写"} · ${selectedClass.value?.name ?? "班级待填写"}`
  }

  async function editMember(memberId: string): Promise<void> {
    memberToEdit.value = memberId
    backToEdit()
    await nextTick()
  }

  async function retryGrades(): Promise<void> {
    const schoolId = draft.selectedSchoolId
    if (schoolId.length === 0) return
    const request = ++gradeRequest
    gradeState.value = "loading"
    gradeError.value = ""
    try {
      const grades = await api.listGrades(schoolId)
      if (request !== gradeRequest || schoolId !== draft.selectedSchoolId) return
      catalog.grades = [...enrollmentGrades(grades, selectedSession.value)]
      gradeState.value = catalog.grades.length === 0 ? "empty" : "ready"
      if (!catalog.grades.some(item => item.id === draft.selectedGradeId)) {
        draft.selectedGradeId = ""
        draft.selectedClassId = ""
      }
    } catch (error) {
      if (request !== gradeRequest || schoolId !== draft.selectedSchoolId) return
      gradeState.value = "error"
      gradeError.value = readableError(error, "年级加载失败，请重试")
    }
  }

  async function onGradeChange(event: PickerChangeEvent): Promise<void> {
    const grade = catalog.grades[readPickerIndex(event)]
    if (grade === undefined) return
    draft.selectedGradeId = grade.id
    draft.selectedClassId = ""
    catalog.classes = []
    resetCheckout()
    errorMessage.value = ""

    await retryClasses()
  }

  async function retryClasses(): Promise<void> {
    const gradeId = draft.selectedGradeId
    if (gradeId.length === 0) return
    const request = ++classRequest
    classState.value = "loading"
    classError.value = ""
    try {
      const classes = await api.listClasses(gradeId)
      if (request !== classRequest || gradeId !== draft.selectedGradeId) return
      catalog.classes = [...enrollmentClasses(classes, selectedSession.value)]
      classState.value = catalog.classes.length === 0 ? "empty" : "ready"
      if (!catalog.classes.some(item => item.id === draft.selectedClassId)) draft.selectedClassId = ""
    } catch (error) {
      if (request !== classRequest || gradeId !== draft.selectedGradeId) return
      classState.value = "error"
      classError.value = readableError(error, "班级加载失败，请重试")
    }
  }

  function onClassChange(event: PickerChangeEvent): void {
    draft.selectedClassId = catalog.classes[readPickerIndex(event)]?.id ?? draft.selectedClassId
    resetCheckout()
  }

  async function onSessionChange(event: PickerChangeEvent): Promise<void> {
    persistedDraft.save()
    persistedDraft.pause()
    currentTimeIso.value = new Date().toISOString()
    draft.selectedTourSessionId = availableSessions.value[readPickerIndex(event)]?.id ?? draft.selectedTourSessionId
    persistedDraft.restore(draft.selectedTourSessionId)
    gradeRequest++
    classRequest++
    catalog.grades = []
    catalog.classes = []
    classState.value = "idle"
    classError.value = ""
    resetCheckout()
    await retryGrades()
    if (draft.selectedGradeId) await retryClasses()
  }

  function addMember(): void {
    const memberId = `local-member-${Date.now()}-${draft.familyMembers.length + 1}`
    draft.familyMembers.push({
      id: memberId,
      code: createLocalMemberCode(memberId),
      displayName: "",
      participantKind: "student",
      identityNumber: "",
      phone: "",
      selected: true,
      saveAsCommon: false,
    })
  }

  function toggleMember(memberId: string): void {
    const member = draft.familyMembers.find((item) => item.id === memberId)
    if (member !== undefined) {
      member.selected = !member.selected
      resetCheckout()
    }
  }

  function removeMember(memberId: string): void {
    draft.familyMembers = draft.familyMembers.filter((member) => member.id !== memberId || member.fromCommonList)
    errorMessage.value = ""
  }

  async function updateSavedMemberName(memberId: string, displayName: string): Promise<void> {
    const member = draft.familyMembers.find((item) => item.remoteMemberId === memberId)
    if (member === undefined) return
    const updated = await api.updateEnrollmentMember(memberId, { displayName: displayName.trim() })
    member.displayName = updated.displayName
    savedMembers.value = savedMembers.value.map((item) => item.id === memberId ? { ...item, displayName: updated.displayName } : item)
    resetCheckout()
  }

  function clearHistoricalMembers(): void {
    savedMembers.value = []
    savedMemberPlacements.value = new Map()
    memberPlacementRequest++
    memberToEdit.value = null
    draft.familyMembers = draft.familyMembers.filter((member) => !member.fromCommonList || member.selected)
    for (const member of draft.familyMembers) {
      if (member.remoteMemberId !== undefined) member.code = createLocalMemberCode()
      if (member.fromCommonList) {
        member.id = `local-member-${member.code}`
        member.identityNumber = ""
        member.phone = ""
      }
      delete member.remoteMemberId
      delete member.fromCommonList
    }
  }

  function adoptLoginDraft(response?: WechatLoginResponse, verifiedPhone?: string): void {
    persistedDraft.syncOwner(true)
    phoneVerified.value = response?.phoneVerified === true && getWechatSessionPhoneVerified()
    if (phoneVerified.value && typeof verifiedPhone === "string" && verifiedPhone.length > 0) draft.contactPhone = verifiedPhone
  }

  async function completeLogin(response?: WechatLoginResponse): Promise<void> {
    persistedDraft.syncOwner(true)
    const loginOwner = getEnrollmentDraftOwner()
    const loginToken = getWechatSessionToken()
    authenticated.value = true
    phoneVerified.value = response === undefined ? currentSessionPhoneVerified() : response.phoneVerified === true && getWechatSessionPhoneVerified()
    loginRequested.value = false
    loginPromptVisible.value = false
    api = createMiniappApi()
    if (order.value !== null && health.healthNeedsLogin.value) {
      await retryHealthNotes()
      return
    }
    try {
      const members = await api.listEnrollmentMembers()
      if (loginOwner !== getEnrollmentDraftOwner() || loginToken !== getWechatSessionToken()) return
      savedMembers.value = members
      const available = savedMembers.value.filter((member) => member.schoolId === draft.selectedSchoolId)
      for (const member of available) {
        if (draft.familyMembers.some((existing) => existing.remoteMemberId === member.id)) continue
        draft.familyMembers.push({ id: member.id, code: member.code, displayName: member.displayName, participantKind: member.participantKind ?? "student", identityNumber: member.identityNumberMasked ?? "", phone: member.phoneMasked ?? "", remoteMemberId: member.id, fromCommonList: true, selected: false })
      }
      await retryMemberPlacements()
    } catch (error) {
      const sessionExpired = error instanceof ApiError && error.statusCode === 401 && loginToken !== undefined && getWechatSessionToken() === undefined
      if ((loginOwner !== getEnrollmentDraftOwner() || loginToken !== getWechatSessionToken()) && !sessionExpired) return
      if (error instanceof ApiError && error.statusCode === 401) {
        authenticated.value = false
        phoneVerified.value = false
        clearHistoricalMembers()
        reviewAfterLogin = false
        loginRequested.value = true
        await nextTick()
      }
      errorMessage.value = readableError(error, "常用参加人加载失败，请稍后重试")
    }
    if (reviewAfterLogin) { reviewAfterLogin = false; enterReview() }
  }

  function requestLogin(): void {
    if (authenticated.value) return
    loginPromptVisible.value = true
  }

  function confirmLogin(): void {
    loginPromptVisible.value = false
    loginRequested.value = true
    void nextTick(() => scrollToEnrollmentAnchor("enrollment-login-field"))
  }

  function cancelLogin(): void {
    loginPromptVisible.value = false
    loginRequested.value = false
    reviewAfterLogin = false
  }

  function completeServiceConsent(): void {
    const action = serviceConsentAction
    serviceConsentAction = undefined
    serviceConsentVisible.value = false
    if (action === "review") enterReview()
    if (action === "submit") void submitEnrollment()
  }

  function cancelServiceConsent(): void {
    serviceConsentAction = undefined
    serviceConsentVisible.value = false
  }

  watch(draft, () => { errorMessage.value = "" })
  watch(() => [draft.selectedTourSessionId, selectedSession.value?.activeNotice?.id, selectedSession.value?.activeNotice?.version], () => {
    draft.agreementAccepted = false
    for (const member of draft.familyMembers) member.healthConsent = false
  })
  watch(() => [draft.selectedGradeId, draft.selectedClassId], () => {
    for (const member of draft.familyMembers) {
      if (!member.fromCommonList && member.participantKind !== "adult" && member.remoteMemberId !== undefined) {
        delete member.remoteMemberId
        member.code = createLocalMemberCode()
      }
    }
  })
  watch(() => JSON.stringify({
    contactName: draft.contactName, contactPhone: draft.contactPhone,
    emergencyContact: draft.emergencyContact, emergencySameAsParent: draft.emergencySameAsParent,
    school: draft.selectedSchoolId, grade: draft.selectedGradeId, schoolClass: draft.selectedClassId,
    session: draft.selectedTourSessionId, agreement: draft.agreementAccepted,
    members: selectedMembers.value.map((member) => ({ id: member.id, name: member.displayName,
      kind: member.participantKind, identity: member.identityNumber, phone: member.phone, save: member.saveAsCommon })),
  }), resetCheckout)

  function enterReview(): void {
    if (!authenticated.value) {
      reviewAfterLogin = true
      requestLogin()
      return
    }
    if (!hasServiceConsent()) {
      serviceConsentAction = "review"
      serviceConsentVisible.value = true
      return
    }
    validationShown.value = true
    currentTimeIso.value = new Date().toISOString()
    if (!selectedTripGate.value.open) {
      errorMessage.value = selectedTripGate.value.reason
      scrollToEnrollmentAnchor("enrollment-session-field")
      return
    }
    const target = readFirstEnrollmentInvalidTarget(draft)
    if (target !== undefined) {
      errorMessage.value = target.reason
      void nextTick(() => scrollToEnrollmentAnchor(target.anchor))
      return
    }
    errorMessage.value = ""
    if (!phoneVerified.value) {
      reviewAfterLogin = true
      loginRequested.value = true
      errorMessage.value = "请先完成微信手机号授权，再核对报名信息。"
      void nextTick(() => scrollToEnrollmentAnchor("enrollment-login-field"))
      return
    }
    pageMode.value = "review"
  }

  function backToEdit(): void {
    pageMode.value = "editing"
    errorMessage.value = ""
  }

  function clearCurrentDraft(): void {
    if (pageMode.value !== "editing") return
    const clearingOwner = getEnrollmentDraftOwner()
    const clearingSession = draft.selectedTourSessionId
    uni.showModal({
      title: "清除本次草稿？",
      content: "将清除本设备上本次报名已填写的信息，不会删除其他团期的草稿、常用参加人或已提交订单。",
      confirmText: "清除草稿",
      success: result => {
        if (!result.confirm || clearingOwner !== getEnrollmentDraftOwner() || clearingSession !== draft.selectedTourSessionId || pageMode.value !== "editing") return
        if (!persistedDraft.reset()) return
        classRequest++
        catalog.classes = []
        classState.value = "idle"
        classError.value = ""
        validationShown.value = false
        errorMessage.value = ""
        resetCheckout()
      },
      fail: () => { errorMessage.value = "未能打开清除确认，请重试" },
    })
  }

  async function submitEnrollment(): Promise<void> {
    if (!hasServiceConsent()) {
      serviceConsentAction = "submit"
      serviceConsentVisible.value = true
      return
    }
    if (!canSubmit.value) return
    const submittingOwner = getEnrollmentDraftOwner(), submittingToken = getWechatSessionToken()
    pageMode.value = "submitting"
    errorMessage.value = ""
    try {
      if (submissionCode.value.length === 0) {
        const submittedDraft = { ...draft, emergencyContact: { ...draft.emergencyContact }, familyMembers: selectedMembers.value.map((member) => ({ ...member })) }
        await api.checkEnrollmentAvailability(submittedDraft.selectedTourSessionId, new Date().toISOString())
        let memberIds: readonly string[]
        try {
          memberIds = await prepareSelectedMembersForSubmit(submittedDraft, api.createEnrollmentMember)
        } finally {
          for (const member of submittedDraft.familyMembers) {
            const original = draft.familyMembers.find((entry) => entry.id === member.id)
            if (original !== undefined && member.remoteMemberId !== undefined) original.remoteMemberId = member.remoteMemberId
          }
        }
        const payload = buildEnrollmentPayload(submittedDraft, catalog, memberIds)
        const submission = await api.submitEnrollment(payload)
        submissionCode.value = submission.id
        persistedDraft.clear()
        health.captureHealth(submittedDraft.familyMembers)
      }
      const createdOrder = await api.createOrder(
        buildCreateOrderPayload(submissionCode.value, draft.contactName, createOrderRequestKey(submissionCode.value)),
      )
      if (submittingOwner !== getEnrollmentDraftOwner() || submittingToken !== getWechatSessionToken()) return
      order.value = createdOrder
      pageMode.value = nextPageModeForOrder(createdOrder)
      const healthSaved = await health.saveHealth(createdOrder.id, draft.familyMembers)
      if (health.healthNeedsLogin.value) { authenticated.value = false; phoneVerified.value = false }
      const contractReady = await refreshContract()
      if (!healthSaved) return
      if (contractReady && wechatPaymentAvailable.value && canStartPayment(createdOrder)) {
        await startPayment()
      }
    } catch (error) {
      pageMode.value = "review"
      if (error instanceof ApiError && error.statusCode === 401) {
        authenticated.value = false
        phoneVerified.value = false
        clearHistoricalMembers()
        pageMode.value = "editing"
        reviewAfterLogin = true
        requestLogin()
        await nextTick()
      }
      errorMessage.value = readableError(error, "提交失败，请稍后重试")
    }
  }

  async function retryHealthNotes(): Promise<void> {
    const currentOrder = order.value
    if (currentOrder === null || health.healthState.value === "saving") return
    if (!authenticated.value) { requestLogin(); return }
    await health.saveHealth(currentOrder.id, draft.familyMembers)
    if (health.healthNeedsLogin.value) { authenticated.value = false; phoneVerified.value = false }
  }

  function openHealthOrder(): void {
    const currentOrder = order.value
    if (currentOrder !== null) uni.navigateTo({ url: `/pages/orders/detail?orderId=${encodeURIComponent(currentOrder.id)}` })
  }

  async function startPayment(): Promise<void> {
    const currentOrder = order.value
    const owner = getEnrollmentDraftOwner(), token = getWechatSessionToken()
    if (!canStartPayment(currentOrder) || health.healthState.value === "saving") return
    errorMessage.value = ""
    pageMode.value = "paymentPending"
    try {
      if (!await refreshContract()) return
      if (!wechatPaymentAvailable.value) {
        errorMessage.value = paymentUnavailableNotice
        return
      }
      const code = await loginForWechatPayment()
      if (owner !== getEnrollmentDraftOwner() || token !== getWechatSessionToken() || currentOrder.id !== order.value?.id) return
      const wechatPayment = await api.createWechatPayment(currentOrder.id, code)
      if (owner !== getEnrollmentDraftOwner() || token !== getWechatSessionToken() || currentOrder.id !== order.value?.id) return
      await requestWechatPayment(wechatPayment.miniappPayment)
      payment.value = wechatPayment
      await refreshOrder()
    } catch (error) {
      errorMessage.value = wechatPaymentFailureMessage(error)
    }
  }

async function loginForWechatPayment(): Promise<string> {
  return await new Promise((resolve, reject) => {
    uni.login({ provider: "weixin", success: (result) => {
      if (typeof result.code === "string" && result.code.length > 0) resolve(result.code)
      else reject(new Error("暂时无法确认微信身份，请重试"))
    }, fail: reject })
  })
}

async function requestWechatPayment(payment: WechatMiniappPayment["miniappPayment"]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    uni.requestPayment({ provider: "wxpay", ...payment, success: () => resolve(), fail: reject })
  })
}

  async function refreshOrder(): Promise<void> {
    const currentOrder = order.value
    if (currentOrder === null) return
    const owner = getEnrollmentDraftOwner(), token = getWechatSessionToken()
    errorMessage.value = ""
    try {
      const refreshed = await api.getOrder(currentOrder.id)
      if (owner !== getEnrollmentDraftOwner() || token !== getWechatSessionToken() || order.value?.id !== currentOrder.id) return
      if (refreshed.status === "cancelled") {
        order.value = null
        resetCheckout()
        pageMode.value = "editing"
        errorMessage.value = "原订单已取消，可重新核对信息并报名。"
        return
      }
      order.value = refreshed
      pageMode.value = nextPageModeForOrder(refreshed)
      await refreshContract()
    } catch (error) {
      if (owner !== getEnrollmentDraftOwner() || token !== getWechatSessionToken() || order.value?.id !== currentOrder.id) return
      errorMessage.value = readableError(error, "订单状态刷新失败，请重试")
    }
  }


  function resetCheckout(): void {
    if (order.value !== null) return
    submissionCode.value = ""
    order.value = null
    payment.value = null
    contract.value = null
    contractState.value = "idle"
    health.resetHealth()
  }

  function memberFieldError(member: FamilyMember, field: MemberFieldName): string {
    return validationShown.value ? readMemberFieldError(member, field) ?? "" : ""
  }

  function contactFieldError(field: ContactFieldName): string {
    return validationShown.value ? readContactFieldError(draft, field) ?? "" : ""
  }

  return {
    contract, contractState, contractPending, refreshContract, openContract,
    draftStatus: persistedDraft.status, clearCurrentDraft,
    healthState: health.healthState, healthNeedsLogin: health.healthNeedsLogin, healthMessage: health.healthMessage,
    retryHealthNotes, openHealthOrder,
    loginPromptVisible, confirmLogin,
    schoolIndex, gradeIndex, classIndex, sessionIndex,
    gradeState, classState, gradeError, classError, retryGrades, retryClasses,
    authenticated, phoneVerified, adoptLoginDraft, completeLogin, loginRequested, requestLogin, cancelLogin, removeMember, validationShown,
    serviceConsentVisible, completeServiceConsent, cancelServiceConsent,
    addMember,
    availableSessions,
    backToEdit,
    canRetryPayment,
    canReview,
    canSubmit,
    catalog,
    classNames,
    contactFieldError,
    draft,
    enterReview,
    errorMessage,
    gradeNames,
    loadCatalog,
    loadState,
    loadStateLabel,
    memberFieldError,
    memberPlacement, memberPlacementFailed, retryMemberPlacements, memberToEdit, editMember,
    onClassChange,
    onGradeChange,
    onSchoolChange,
    onSessionChange,
    order,
    orderLabel,
    pageMode,
    payment,
    paymentCapabilities,
    paymentUnavailableNotice,
    readiness,
    refreshOrder,
    schoolNames,
    selectedClass,
    selectedGrade,
    selectedMembers,
    selectedSchool,
    selectedSession,
    sessionNames,
    startPayment,
    stateTone,
    submissionCode,
    wechatPaymentAvailable,
    submitEnrollment,
    toggleMember,
    updateSavedMemberName,
  }
}
