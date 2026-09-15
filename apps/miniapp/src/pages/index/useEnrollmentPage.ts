import { computed, onMounted, reactive, ref } from "vue"
import {
  ApiError,
  FAMILY_ENROLLMENT_AGREEMENT_VERSION,
  createMiniappApi,
  type Grade,
  type School,
  type SchoolClass,
  type TourSession,
} from "../../api"
import {
  buildEnrollmentPayload,
  createEmptyDraft,
  optionNames,
  prepareSelectedMembersForSubmit,
  readEnrollmentReadiness,
  selectedFamilyMembers,
  sessionOptionNames,
  type CatalogState,
  type LoadState,
  type PageMode,
} from "../../enrollment-flow"

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
  const draft = reactive({
    ...createEmptyDraft(),
    familyMembers: [] as { id: string; code: string; displayName: string; selected: boolean; remoteMemberId?: string }[],
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
  const selectedMembers = computed(() => selectedFamilyMembers(draft.familyMembers))
  const readiness = computed(() => readEnrollmentReadiness(draft))
  const canReview = computed(() => loadState.value === "ready" && pageMode.value === "editing" && readiness.value.ready)
  const canSubmit = computed(() => pageMode.value === "review" && readiness.value.ready)
  const loadStateLabel = computed(() => stateLabel(loadState.value))

  onMounted(() => {
    void loadCatalog()
  })

  async function loadCatalog(): Promise<void> {
    loadState.value = "loading"
    errorMessage.value = ""
    try {
      const [schools, sessions] = await Promise.all([api.listSchools(), api.listTourSessions()])
      catalog.schools = [...schools]
      catalog.sessions = [...sessions]
      catalog.grades = []
      catalog.classes = []
      draft.selectedSchoolId = ""
      draft.selectedGradeId = ""
      draft.selectedClassId = ""
      draft.selectedTourSessionId = ""
      loadState.value = catalog.schools.length === 0 || catalog.sessions.length === 0 ? "empty" : "ready"
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
    draft.selectedTourSessionId = ""
    catalog.grades = []
    catalog.classes = []
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
    errorMessage.value = ""

    try {
      catalog.classes = [...(await api.listClasses(grade.id))]
    } catch (error) {
      errorMessage.value = readableError(error, "班级加载失败，请重试")
    }
  }

  function onClassChange(event: PickerChangeEvent): void {
    draft.selectedClassId = catalog.classes[readPickerIndex(event)]?.id ?? draft.selectedClassId
  }

  function onSessionChange(event: PickerChangeEvent): void {
    draft.selectedTourSessionId = availableSessions.value[readPickerIndex(event)]?.id ?? draft.selectedTourSessionId
  }

  function addMember(): void {
    draft.familyMembers.push({
      id: `local-member-${Date.now()}-${draft.familyMembers.length + 1}`,
      code: "",
      displayName: "",
      selected: true,
    })
  }

  function toggleMember(memberId: string): void {
    const member = draft.familyMembers.find((item) => item.id === memberId)
    if (member !== undefined) {
      member.selected = !member.selected
    }
  }

  function enterReview(): void {
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
  }

  async function submitEnrollment(): Promise<void> {
    if (!canSubmit.value) return
    pageMode.value = "submitting"
    errorMessage.value = ""
    try {
      await api.checkEnrollmentAvailability(draft.selectedTourSessionId, new Date().toISOString())
      const memberIds = await prepareSelectedMembersForSubmit(draft, api.createEnrollmentMember)
      const payload = buildEnrollmentPayload(draft, catalog as CatalogState, memberIds)
      submissionCode.value = (await api.submitEnrollment(payload)).id
      pageMode.value = "submitted"
    } catch (error) {
      pageMode.value = "review"
      errorMessage.value = readableError(error, "提交失败，请稍后重试")
    }
  }

  return {
    FAMILY_ENROLLMENT_AGREEMENT_VERSION,
    addMember,
    availableSessions,
    backToEdit,
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
    pageMode,
    readiness,
    schoolNames,
    selectedClass,
    selectedGrade,
    selectedMembers,
    selectedSchool,
    selectedSession,
    sessionNames,
    submissionCode,
    submitEnrollment,
    toggleMember,
  }
}

function stateLabel(state: LoadState): string {
  switch (state) {
    case "loading":
      return "正在加载"
    case "ready":
      return "可填写"
    case "empty":
      return "暂无可选团期"
    case "error":
      return "加载失败"
    default:
      return assertNever(state)
  }
}

function readPickerIndex(event: PickerChangeEvent): number {
  const value = event.detail.value
  return typeof value === "number" ? value : Number.parseInt(value, 10)
}

function readableError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message.length > 0) return error.message
  return fallback
}

function assertNever(value: never): never {
  throw new Error(`Unexpected state: ${value}`)
}
