import { computed, onMounted, reactive, ref } from "vue"
import { onLoad } from "@dcloudio/uni-app"
import {
  createMiniappApi, type Grade, type MockPayment,
  type Order, type SavedEnrollmentMember, type School, type SchoolClass, type TourSession, type WechatMiniappPayment,
} from "../../api"
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
import { readableError, readPickerIndex, readStateTone, stateLabel } from "./page-helpers"

export type PickerChangeEvent = {
  readonly detail: {
    readonly value: number | string
  }
}

export function useEnrollmentPage() {
  const api = createMiniappApi()
  const loadState = ref<LoadState>("loading")
  const pageMode = ref<PageMode>("editing")
  const errorMessage = ref("")
  const submissionCode = ref("")
  const currentTimeIso = ref(new Date().toISOString())
  const order = ref<Order | null>(null)
  const payment = ref<MockPayment | WechatMiniappPayment | null>(null)
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
  const canReview = computed(() => loadState.value === "ready" && pageMode.value === "editing" && readiness.value.ready)
  const canSubmit = computed(() => pageMode.value === "review" && readiness.value.ready)
  const canRetryPayment = computed(() => canStartPayment(order.value) && pageMode.value === "paymentPending")
  const loadStateLabel = computed(() => stateLabel(loadState.value, pageMode.value))
  const stateTone = computed(() => readStateTone(loadState.value, pageMode.value))
  const orderLabel = computed(() => orderStatusLabel(order.value))
  const wechatPayEnabled = import.meta.env["VITE_WECHAT_PAY_ENABLED"] === "true"
  const productionBuild = import.meta.env["PROD"] === true

  onMounted(() => {
    void loadCatalog()
  })

  async function loadCatalog(): Promise<void> {
    loadState.value = "loading"
    pageMode.value = "editing"
    errorMessage.value = ""
    resetCheckout()
    try {
      const [activities, schools, sessions, members] = await Promise.all([
        api.listCatalogItems(),
        api.listSchools(),
        api.listTourSessions(),
        api.listEnrollmentMembers(),
      ])
      const options = activeEnrollmentOptions(activities, sessions, schools)
      savedMembers.value = members
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
      loadState.value = "error"
      errorMessage.value = readableError(error, "目录加载失败，请稍后重试")
    }
  }

  async function onSchoolChange(event: PickerChangeEvent): Promise<void> {
    const school = catalog.schools[readPickerIndex(event)]
    if (school === undefined) return
    draft.selectedSchoolId = school.id
    draft.selectedGradeId = ""
    draft.selectedClassId = ""
    draft.selectedTourSessionId = catalog.sessions.find((session) => session.id === wantedSessionId.value && session.organizationId === school.id)?.id ?? ""
    draft.familyMembers = savedMembers.value.filter((member) => member.schoolId === school.id).map((member) => ({
      id: member.id,
      code: member.code,
      displayName: member.displayName,
      participantKind: member.participantKind ?? "student",
      identityNumber: member.identityNumberMasked ?? "",
      phone: member.phoneMasked ?? "",
      remoteMemberId: member.id,
      selected: false,
    }))
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
    draft.familyMembers.push({
      id: `local-member-${Date.now()}-${draft.familyMembers.length + 1}`,
      code: "",
      displayName: "",
      participantKind: "student",
      identityNumber: "",
      phone: "",
      selected: true,
    })
  }

  function toggleMember(memberId: string): void {
    const member = draft.familyMembers.find((item) => item.id === memberId)
    if (member !== undefined) {
      member.selected = !member.selected
      resetCheckout()
    }
  }

  function enterReview(): void {
    currentTimeIso.value = new Date().toISOString()
    if (!readiness.value.ready) {
      errorMessage.value = readiness.value.reason
      return
    }
    errorMessage.value = ""
    pageMode.value = "review"
  }

  function backToEdit(): void {
    pageMode.value = "editing"
    errorMessage.value = ""
    resetCheckout()
  }

  async function submitEnrollment(): Promise<void> {
    if (!canSubmit.value) return
    pageMode.value = "submitting"
    errorMessage.value = ""
    try {
      await api.checkEnrollmentAvailability(draft.selectedTourSessionId, new Date().toISOString())
      const memberIds = await prepareSelectedMembersForSubmit(draft, api.createEnrollmentMember)
      const payload = buildEnrollmentPayload(draft, catalog, memberIds)
      const submission = await api.submitEnrollment(payload)
      submissionCode.value = submission.id
      const createdOrder = await api.createOrder(
        buildCreateOrderPayload(submission.id, draft.contactName, createOrderRequestKey(submission.id)),
      )
      order.value = createdOrder
      pageMode.value = nextPageModeForOrder(createdOrder)
      if (canStartPayment(createdOrder)) {
        await startPayment()
      }
    } catch (error) {
      pageMode.value = "review"
      errorMessage.value = readableError(error, "提交失败，请稍后重试")
    }
  }

  async function startPayment(): Promise<void> {
    const currentOrder = order.value
    if (!canStartPayment(currentOrder)) return
    errorMessage.value = ""
    pageMode.value = "paymentPending"
    try {
      if (wechatPayEnabled) {
        const wechatPayment = await api.createWechatPayment(currentOrder.id, await loginForWechatPayment())
        await requestWechatPayment(wechatPayment.miniappPayment)
        payment.value = wechatPayment
      } else {
        if (productionBuild) throw new Error("微信支付未启用")
        payment.value = await api.createMockPayment(currentOrder.id)
      }
      await refreshOrder()
    } catch (error) {
      errorMessage.value = readableError(error, "支付发起失败，请重试")
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

  return {
    addMember,
    availableSessions,
    backToEdit,
    canRetryPayment,
    canReview,
    canSubmit,
    catalog,
    classNames,
    draft,
    enterReview,
    errorMessage,
    gradeNames,
    loadCatalog,
    loadState,
    loadStateLabel,
    onClassChange,
    onGradeChange,
    onSchoolChange,
    onSessionChange,
    order,
    orderLabel,
    pageMode,
    payment,
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
    submitEnrollment,
    toggleMember,
  }
}
