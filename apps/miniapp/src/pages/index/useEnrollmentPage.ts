import { computed, nextTick, onMounted, reactive, ref, watch } from "vue"
import { onLoad } from "@dcloudio/uni-app"
import {
  ApiError, createMiniappApi, type Grade,
  type Order,
  type ServiceCapabilities, type SavedEnrollmentMember, type School, type SchoolClass, type TourSession, type WechatMiniappPayment,
} from "../../api"
import { getWechatSessionToken } from "../../wechat-token"
import { activeEnrollmentOptions } from "../../activity-catalog"
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
import { canUseWechatPayment, paymentCapabilitiesClosed, paymentUnavailableNotice } from "../../payment-policy"

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
  const authenticated = ref(import.meta.env["VITE_WECHAT_LOGIN_ENABLED"] !== "true" || getWechatSessionToken() !== undefined)
  const loginRequested = ref(false)
  let reviewAfterLogin = false
  const validationShown = ref(false)
  const loadState = ref<LoadState>("loading")
  const pageMode = ref<PageMode>("editing")
  const errorMessage = ref("")
  const submissionCode = ref("")
  const currentTimeIso = ref(new Date().toISOString())
  const order = ref<Order | null>(null)
  const payment = ref<WechatMiniappPayment | null>(null)
  const paymentCapabilities = ref<ServiceCapabilities>(paymentCapabilitiesClosed)
  const wantedSessionId = ref("")
  const savedMembers = ref<readonly SavedEnrollmentMember[]>([])
  onLoad((query) => { wantedSessionId.value = query?.["sessionId"] ?? "" })
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

  const schoolNames = computed(() => optionNames(catalog.schools))
  const gradeNames = computed(() => optionNames(catalog.grades))
  const classNames = computed(() => optionNames(catalog.classes))
  const availableSessions = computed(() =>
    catalog.sessions.filter((session) => session.organizationId === draft.selectedSchoolId),
  )
  const sessionNames = computed(() => sessionOptionNames(availableSessions.value))
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
  const canSubmit = computed(() => authenticated.value && pageMode.value === "review" && readiness.value.ready)
  const wechatPaymentAvailable = computed(() => canUseWechatPayment({ capabilities: paymentCapabilities.value, buildWechatPaymentEnabled }))
  const canRetryPayment = computed(() => wechatPaymentAvailable.value && canStartPayment(order.value) && pageMode.value === "paymentPending")
  const loadStateLabel = computed(() => stateLabel(loadState.value, pageMode.value))
  const stateTone = computed(() => readStateTone(loadState.value, pageMode.value))
  const orderLabel = computed(() => orderStatusLabel(order.value))
  const buildWechatPaymentEnabled = import.meta.env["VITE_WECHAT_PAY_ENABLED"] === "true"

  onMounted(() => {
    void loadCatalog()
  })

  async function loadCatalog(): Promise<void> {
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
      savedMembers.value = members
      paymentCapabilities.value = capabilities
      catalog.schools = [...options.schools]
      catalog.sessions = [...options.sessions]
      catalog.grades = []
      catalog.classes = []
      draft.selectedSchoolId = ""
      draft.selectedGradeId = ""
      draft.selectedClassId = ""
      draft.selectedTourSessionId = ""
      currentTimeIso.value = new Date().toISOString()
      loadState.value = catalog.schools.length === 0 || catalog.sessions.length === 0 ? "empty" : "ready"
      const wantedSession = options.sessions.find((session) => session.id === wantedSessionId.value)
      const schoolIndex = options.schools.findIndex((school) => school.id === wantedSession?.organizationId)
      if (schoolIndex >= 0) await onSchoolChange({ detail: { value: schoolIndex } })
    } catch (error) {
      if (authenticated.value && error instanceof ApiError && error.statusCode === 401) {
        authenticated.value = false
        await loadCatalog()
        return
      }
      loadState.value = "error"
      errorMessage.value = readableError(error, "目录加载失败，请稍后重试")
    }
  }

  async function onSchoolChange(event: PickerChangeEvent): Promise<void> {
    const school = catalog.schools[readPickerIndex(event)]
    if (school === undefined) return
    const localMembers = draft.familyMembers.filter((member) => !member.fromCommonList)
    if (draft.selectedSchoolId !== school.id) {
      for (const member of localMembers) delete member.remoteMemberId
    }
    draft.selectedSchoolId = school.id
    draft.selectedGradeId = ""
    draft.selectedClassId = ""
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

    try {
      catalog.grades = [...(await api.listGrades(school.id))]
    } catch (error) {
      errorMessage.value = readableError(error, "年级加载失败，请重试")
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

    try {
      catalog.classes = [...(await api.listClasses(grade.id))]
    } catch (error) {
      errorMessage.value = readableError(error, "班级加载失败，请重试")
    }
  }

  function onClassChange(event: PickerChangeEvent): void {
    draft.selectedClassId = catalog.classes[readPickerIndex(event)]?.id ?? draft.selectedClassId
    resetCheckout()
  }

  function onSessionChange(event: PickerChangeEvent): void {
    currentTimeIso.value = new Date().toISOString()
    draft.selectedTourSessionId = availableSessions.value[readPickerIndex(event)]?.id ?? draft.selectedTourSessionId
    resetCheckout()
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

  async function completeLogin(): Promise<void> {
    authenticated.value = true
    loginRequested.value = false
    api = createMiniappApi()
    try {
      savedMembers.value = await api.listEnrollmentMembers()
      const available = savedMembers.value.filter((member) => member.schoolId === draft.selectedSchoolId)
      for (const member of available) {
        if (draft.familyMembers.some((existing) => existing.remoteMemberId === member.id)) continue
        draft.familyMembers.push({ id: member.id, code: member.code, displayName: member.displayName, participantKind: member.participantKind ?? "student", identityNumber: member.identityNumberMasked ?? "", phone: member.phoneMasked ?? "", remoteMemberId: member.id, fromCommonList: true, selected: false })
      }
    } catch (error) { errorMessage.value = readableError(error, "常用参加人加载失败，请稍后重试") }
    if (reviewAfterLogin) { reviewAfterLogin = false; enterReview() }
  }

  function requestLogin(): void {
    loginRequested.value = true
    void nextTick(() => scrollToEnrollmentAnchor("enrollment-login-field"))
  }

  function cancelLogin(): void {
    loginRequested.value = false
    reviewAfterLogin = false
  }

  watch(draft, () => { errorMessage.value = "" })
  watch(() => [draft.selectedTourSessionId, selectedSession.value?.activeNotice?.id, selectedSession.value?.activeNotice?.version], () => { draft.agreementAccepted = false })
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
      scrollToEnrollmentAnchor(target.anchor)
      return
    }
    errorMessage.value = ""
    if (!authenticated.value) {
      reviewAfterLogin = true
      requestLogin()
      return
    }
    pageMode.value = "review"
  }

  function backToEdit(): void {
    pageMode.value = "editing"
    errorMessage.value = ""
  }

  async function submitEnrollment(): Promise<void> {
    if (!canSubmit.value) return
    pageMode.value = "submitting"
    errorMessage.value = ""
    try {
      if (submissionCode.value.length === 0) {
        await api.checkEnrollmentAvailability(draft.selectedTourSessionId, new Date().toISOString())
        const memberIds = await prepareSelectedMembersForSubmit(draft, api.createEnrollmentMember)
        const payload = buildEnrollmentPayload(draft, catalog, memberIds)
        const submission = await api.submitEnrollment(payload)
        submissionCode.value = submission.id
      }
      const createdOrder = await api.createOrder(
        buildCreateOrderPayload(submissionCode.value, draft.contactName, createOrderRequestKey(submissionCode.value)),
      )
      order.value = createdOrder
      pageMode.value = nextPageModeForOrder(createdOrder)
      if (wechatPaymentAvailable.value && canStartPayment(createdOrder)) {
        await startPayment()
      }
    } catch (error) {
      pageMode.value = "review"
      if (error instanceof ApiError && error.statusCode === 401) {
        authenticated.value = false
        pageMode.value = "editing"
        reviewAfterLogin = true
        requestLogin()
      }
      errorMessage.value = readableError(error, "提交失败，请稍后重试")
    }
  }

  async function startPayment(): Promise<void> {
    const currentOrder = order.value
    if (!canStartPayment(currentOrder)) return
    errorMessage.value = ""
    pageMode.value = "paymentPending"
    try {
      if (!wechatPaymentAvailable.value) {
        errorMessage.value = paymentUnavailableNotice
        return
      }
      const wechatPayment = await api.createWechatPayment(currentOrder.id, await loginForWechatPayment())
      await requestWechatPayment(wechatPayment.miniappPayment)
      payment.value = wechatPayment
      await refreshOrder()
    } catch (error) {
      errorMessage.value = readableError(error, "微信支付发起失败，请稍后重试")
    }
  }

async function loginForWechatPayment(): Promise<string> {
  return await new Promise((resolve, reject) => {
    uni.login({ provider: "weixin", success: (result) => {
      if (typeof result.code === "string" && result.code.length > 0) resolve(result.code)
      else reject(new Error("微信登录未返回 code"))
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
    errorMessage.value = ""
    try {
      const refreshed = await api.getOrder(currentOrder.id)
      order.value = refreshed
      pageMode.value = nextPageModeForOrder(refreshed)
    } catch (error) {
      errorMessage.value = readableError(error, "订单状态刷新失败，请重试")
    }
  }


  function resetCheckout(): void {
    submissionCode.value = ""
    order.value = null
    payment.value = null
  }

  function memberFieldError(member: FamilyMember, field: MemberFieldName): string {
    return validationShown.value ? readMemberFieldError(member, field) ?? "" : ""
  }

  function contactFieldError(field: ContactFieldName): string {
    return validationShown.value ? readContactFieldError(draft, field) ?? "" : ""
  }

  return {
    authenticated, completeLogin, loginRequested, requestLogin, cancelLogin, removeMember, validationShown,
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
  }
}
