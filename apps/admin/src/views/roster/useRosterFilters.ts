import { computed, onMounted, reactive, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { listCatalogItems, listClasses, listGrades, listSchools, listTourSessions, readableApiError } from "@/api/configuration"
import type { CatalogItem, Grade, School, SchoolClass, TourSession } from "@/api/configuration"

export function useRosterFilters() {
  const route = useRoute()
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
      const [schoolRows, sessionRows, catalogRows] = await Promise.all([listSchools(), listTourSessions(), listCatalogItems()])
      schools.value = schoolRows
      sessions.value = sessionRows
      catalog.value = catalogRows
      const fromLink = route.query["tourSessionId"]
      if (filters.tourSessionId === "" && typeof fromLink === "string" && sessionRows.some(row => row.id === fromLink)) filters.tourSessionId = fromLink
    } catch (caught) { optionsError.value = readableApiError(caught) }
    finally { optionsLoading.value = false }
  }
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
