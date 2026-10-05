import { computed, inject, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { getCurrentStaff, type StaffScope } from "@/api/auth"
import { listCatalogItems, listClasses, listGrades, listSchools, listTourSessions, readableApiError } from "@/api/configuration"
import type { CatalogItem, Grade, School, SchoolClass, TourSession } from "@/api/configuration"
import { pendingSessionNavigationKey, type PendingSessionNavigation } from "@/layouts/session-navigation"

export function useRosterFilters() {
  const route = useRoute()
  const router = useRouter()
  const pagePath = route.path
  const scopes = ref<readonly StaffScope[]>([])
  let optionsReady = false
  let queryUpdates = 0
  const pendingSession = inject(pendingSessionNavigationKey, ref<PendingSessionNavigation>())
  let navigationToken: symbol | undefined
  const filters = reactive({ tourSessionId: "", schoolId: "", gradeId: "", classId: "" })
  const schools = ref<readonly School[]>([])
  const grades = ref<readonly Grade[]>([])
  const classes = ref<readonly SchoolClass[]>([])
  const sessions = ref<readonly TourSession[]>([])
  const catalog = ref<readonly CatalogItem[]>([])
  const optionsLoading = ref(false)
  const gradeLoading = ref(false)
  const classLoading = ref(false)
  const optionsError = ref("")
  const gradeError = ref("")
  const classError = ref("")
  const visibleSessions = computed(() => sessions.value.filter(session => filters.schoolId === "" || session.organizationId === filters.schoolId))
  const optionsBusy = computed(() => optionsLoading.value || gradeLoading.value || classLoading.value)
  const selectionError = computed(() => optionsError.value || gradeError.value || classError.value)

  async function loadOptions(): Promise<void> {
    optionsLoading.value = true
    optionsError.value = ""
    try {
      const [schoolRows, sessionRows, catalogRows, staff] = await Promise.all([listSchools(), listTourSessions(), listCatalogItems(), getCurrentStaff()])
      schools.value = schoolRows
      sessions.value = sessionRows
      catalog.value = catalogRows
      scopes.value = staff.scopes
      optionsReady = true
      readSessionQuery()
    } catch (caught) { optionsError.value = readableApiError(caught) }
    finally { optionsLoading.value = false }
  }
  function readSessionQuery(): void {
    if (!optionsReady || route.path !== pagePath || queryUpdates > 0) return
    const session = permittedSession(route.query["tourSessionId"])
    filters.tourSessionId = session?.id ?? ""
    if (session !== undefined && filters.schoolId !== "" && filters.schoolId !== session.organizationId) filters.schoolId = ""
    void writeSessionQuery()
  }
  async function writeSessionQuery(): Promise<void> {
    if (!optionsReady || route.path !== pagePath) return
    const current = permittedSession(filters.tourSessionId)?.id
    if (route.query["tourSessionId"] === current && pendingSession.value?.path !== pagePath) return
    const query = { ...route.query }
    if (current === undefined) delete query["tourSessionId"]
    else query["tourSessionId"] = current
    queryUpdates += 1
    const token = Symbol()
    navigationToken = token
    pendingSession.value = { path: pagePath, tourSessionId: current, token }
    try { await router.replace({ query }) }
    finally {
      queryUpdates -= 1
      if (pendingSession.value?.token === token) pendingSession.value = undefined
    }
  }
  function permittedSession(id: unknown): TourSession | undefined {
    const session = sessions.value.find(row => row.id === id)
    return session !== undefined && scopes.value.some(scope => scope.kind === "all"
      || (scope.kind === "tour_session" && scope.id === session.id)
      || ((scope.kind === "school" || scope.kind === "organization") && scope.id === session.organizationId)) ? session : undefined
  }
  watch(() => route.query["tourSessionId"], readSessionQuery)
  watch(() => filters.tourSessionId, () => { void writeSessionQuery() }, { flush: "sync" })
  onBeforeUnmount(() => { if (pendingSession.value?.token === navigationToken) pendingSession.value = undefined })
  async function loadGrades(): Promise<void> {
    const schoolId = filters.schoolId
    gradeError.value = ""
    if (schoolId === "") { gradeLoading.value = false; return }
    gradeLoading.value = true
    try {
      const rows = await listGrades(schoolId)
      if (schoolId === filters.schoolId) grades.value = rows
    } catch (caught) {
      if (schoolId === filters.schoolId) gradeError.value = readableApiError(caught)
    } finally { if (schoolId === filters.schoolId) gradeLoading.value = false }
  }
  async function loadClasses(): Promise<void> {
    const gradeId = filters.gradeId
    classError.value = ""
    if (gradeId === "") { classLoading.value = false; return }
    classLoading.value = true
    try {
      const rows = await listClasses(gradeId)
      if (gradeId === filters.gradeId) classes.value = rows
    } catch (caught) {
      if (gradeId === filters.gradeId) classError.value = readableApiError(caught)
    } finally { if (gradeId === filters.gradeId) classLoading.value = false }
  }
  watch(() => filters.schoolId, () => {
    filters.gradeId = ""
    filters.classId = ""
    grades.value = []
    classes.value = []
    classError.value = ""
    classLoading.value = false
    if (!visibleSessions.value.some(row => row.id === filters.tourSessionId)) filters.tourSessionId = ""
    void loadGrades()
  })
  watch(() => filters.gradeId, () => {
    filters.classId = ""
    classes.value = []
    void loadClasses()
  })
  function sessionLabel(session: TourSession): string {
    const title = catalog.value.find(item => item.id === session.catalogItemId)?.title ?? session.code
    const school = schools.value.find(item => item.id === session.organizationId)?.name ?? "未关联学校"
    const date = new Date(session.startsAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })
    return `${title} · ${date} · ${school}（${session.code}）`
  }
  onMounted(loadOptions)
  return { filters, schools, grades, classes, visibleSessions, optionsLoading, gradeLoading, classLoading, optionsError, gradeError, classError, optionsBusy, selectionError, loadOptions, loadGrades, loadClasses, sessionLabel }
}
