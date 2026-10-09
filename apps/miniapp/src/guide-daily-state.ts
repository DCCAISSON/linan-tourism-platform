import { computed, reactive } from "vue"
import { ApiError } from "./api-error"
import type { GuideSession, PersonRef } from "./guide-execution-api"
import { chinaDate } from "./guide-execution-state"
import { dailyMeals, type GuideDailyApi, type PersonDailyInput, type PersonDailyReport, type PersonDailyRevision } from "./guide-daily-api"
import type { StaffAccess } from "./staff-api"

type Dependencies = { readonly api: GuideDailyApi; readonly getSession: (id: string) => Promise<GuideSession>; readonly me: () => Promise<StaffAccess>; readonly token: () => string | undefined; readonly login: () => void }
type RequestContext = { readonly generation: number; readonly token: string }
type DailyForm = { -readonly [Key in keyof PersonDailyInput]: PersonDailyInput[Key] }
function emptyForm(): DailyForm { return { reportDate: "", expectedVersion: 0, correctionReason: "", breakfast: null, lunch: null, dinner: null, breakfastNote: "", lunchNote: "", dinnerNote: "", bodyStatus: "", note: "" } }

export function useGuideDaily(deps: Dependencies) {
  const state = reactive<{ session: GuideSession | null; reports: readonly PersonDailyReport[]; history: readonly PersonDailyRevision[]; historyLoaded: boolean; personRef: PersonRef | ""; form: DailyForm; summary: string; permissions: readonly string[]; loading: boolean; saving: boolean; historyLoading: boolean; error: string; notice: string }>({ session: null, reports: [], history: [], historyLoaded: false, personRef: "", form: emptyForm(), summary: "", permissions: [], loading: false, saving: false, historyLoading: false, error: "", notice: "" })
  let generation = 0
  let historyGeneration = 0
  let loadedToken: string | undefined
  const startsOn = computed(() => state.session ? chinaDate(state.session.startsAt) : "")
  const endsOn = computed(() => state.session ? chinaDate(state.session.endsAt) : "")
  const people = computed(() => state.session?.people.filter(person => state.session?.vehicleIds.includes(person.vehicleId)) ?? [])
  const person = computed(() => people.value.find(row => row.personRef === state.personRef))
  const report = computed(() => state.reports.find(row => row.personRef === state.personRef && row.reportDate === state.form.reportDate))
  const healthReadable = computed(() => state.permissions.includes("health.read") && state.session?.confirmationStatus === "current" && person.value?.healthAuthorized === true && (report.value?.healthReadable ?? true))
  const canWrite = computed(() => state.permissions.includes("execution.write") && state.session?.confirmationStatus === "current" && person.value?.active === true)
  const canPublish = computed(() => state.permissions.includes("execution.publish") && state.session?.confirmationStatus === "current" && person.value !== undefined && report.value !== undefined)
  const busy = computed(() => state.loading || state.saving || state.historyLoading)

  function clear(): void {
    generation += 1; historyGeneration += 1; loadedToken = undefined
    Object.assign(state, { session: null, reports: [], history: [], historyLoaded: false, personRef: "", form: emptyForm(), summary: "", permissions: [], loading: false, saving: false, historyLoading: false, error: "", notice: "" })
  }
  function current(context: RequestContext): boolean {
    if (context.generation !== generation) return false
    if (deps.token() !== context.token) { clear(); return false }
    return true
  }
  function fail(error: unknown, context: RequestContext): void {
    if (context.generation !== generation) return
    if (error instanceof ApiError && error.statusCode === 401 && (deps.token() === context.token || deps.token() === undefined)) { clear(); deps.login(); return }
    if (!current(context)) return
    if (error instanceof ApiError && error.statusCode === 403) { clear(); state.error = "当前账号已无权操作此团期，请联系工作人员核对分配。"; return }
    state.error = error instanceof ApiError ? error.message : "操作未完成，请检查网络后重试。"
  }
  function select(personRef: PersonRef | "", date: string): void {
    historyGeneration += 1
    state.personRef = personRef
    Object.assign(state, { history: [], historyLoaded: false, historyLoading: false, summary: "", form: { ...emptyForm(), reportDate: date } })
    const previous = report.value
    if (!previous) return
    state.form.expectedVersion = previous.version
    for (const meal of dailyMeals) { state.form[meal.key] = previous[meal.key]; state.form[meal.note] = previous[meal.note] }
    state.form.bodyStatus = healthReadable.value ? previous.bodyStatus : ""
    state.form.note = healthReadable.value ? previous.note : ""
    state.summary = previous.publicApproved ? previous.publicSummary : ""
  }
  async function load(sessionId: string): Promise<void> {
    const selected = state.session?.id === sessionId ? { personRef: state.personRef, date: state.form.reportDate } : null
    clear()
    const token = deps.token()
    if (!token) { deps.login(); return }
    if (!sessionId) { state.error = "未找到团期，请返回重新选择。"; return }
    const context = { generation, token }
    state.loading = true
    try {
      const staff = await deps.me()
      if (!current(context)) return
      if (staff.forcePasswordChange) { deps.login(); return }
      if (!staff.permissionKeys.includes("execution.read")) throw new ApiError(403, "无权查看日报")
      const [session, rows] = await Promise.all([deps.getSession(sessionId), deps.api.list(sessionId)])
      if (!current(context)) return
      state.session = session
      state.permissions = staff.permissionKeys
      state.reports = rows.filter(row => row.tourSessionId === session.id && people.value.some(person => person.personRef === row.personRef)).map(row => {
        const readable = staff.permissionKeys.includes("health.read") && session.confirmationStatus === "current" && people.value.some(person => person.personRef === row.personRef && person.healthAuthorized) && row.healthReadable
        return readable ? row : { ...row, bodyStatus: "", note: "", healthReadable: false }
      })
      loadedToken = token
      const selectedRef = selected && people.value.some(person => person.personRef === selected.personRef) ? selected.personRef : ""
      select(selectedRef, selected?.date || startsOn.value)
    } catch (error) { fail(error, context) }
    finally { if (current(context)) state.loading = false }
  }
  function actionContext(allowed: boolean): { readonly session: GuideSession; readonly context: RequestContext } | null {
    if (busy.value) return null
    if (!loadedToken || deps.token() !== loadedToken) { clear(); deps.login(); return null }
    if (!state.session || !allowed) { state.error = "当前不能操作此日报，请核对权限和人车安排。"; return null }
    return { session: state.session, context: { generation, token: loadedToken } }
  }
  async function mutate(action: () => Promise<void>, target: { readonly session: GuideSession; readonly context: RequestContext }, notice: string): Promise<void> {
    state.saving = true; state.error = ""; state.notice = ""
    try {
      await action()
      if (!current(target.context)) return
      await load(target.session.id)
      if (generation === target.context.generation + 1 && deps.token() === target.context.token) {
        if (state.session) state.notice = notice
        else if (state.error) state.notice = "记录已提交，请刷新核对最新结果。"
      }
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 409 && current(target.context)) {
        await load(target.session.id)
        if (generation === target.context.generation + 1 && deps.token() === target.context.token && state.session) state.error = "日报或人车安排已变化，已刷新，请核对后重新填写。"
      } else fail(error, target.context)
    } finally { if (current(target.context)) state.saving = false }
  }
  async function save(): Promise<void> {
    const target = actionContext(canWrite.value)
    const ref = state.personRef
    if (!target || !ref) return
    const date = state.form.reportDate
    const dateValue = Date.parse(`${date}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(dateValue) || new Date(dateValue).toISOString().slice(0, 10) !== date || date < startsOn.value || date > endsOn.value) { state.error = "请选择团期内的有效日期。"; return }
    if (state.form.expectedVersion !== (report.value?.version ?? 0)) { state.error = "日报已变化，请刷新后重新填写。"; return }
    if (report.value && !state.form.correctionReason.trim()) { state.error = "请填写更正原因。"; return }
    const payload = { ...state.form, correctionReason: state.form.correctionReason.trim(), bodyStatus: healthReadable.value ? state.form.bodyStatus : "", note: healthReadable.value ? state.form.note : "" }
    await mutate(() => deps.api.save(target.session.id, ref, payload), target, "个人日报已保存，公开摘要待审批。")
  }
  async function approve(): Promise<void> {
    const target = actionContext(canPublish.value)
    const selected = report.value
    if (!target || !selected) return
    const summary = state.summary.trim()
    if (!summary || summary.length > 1000) { state.error = "请填写1000字以内的公开摘要。"; return }
    await mutate(() => deps.api.approve(target.session.id, selected, summary), target, "公开摘要已批准。")
  }
  async function loadHistory(): Promise<void> {
    const selected = report.value
    const session = state.session
    if (busy.value || !selected || !session || !loadedToken) return
    const context = { generation, token: loadedToken }
    if (!current(context)) return
    const historyTurn = ++historyGeneration
    state.history = []; state.historyLoaded = false; state.historyLoading = true; state.error = ""
    try {
      const rows = await deps.api.history(session.id, selected.id)
      if (!current(context) || historyTurn !== historyGeneration) return
      state.history = rows.filter(row => row.reportId === selected.id && row.tourSessionId === session.id && row.personRef === selected.personRef)
      state.historyLoaded = true
    } catch (error) { if (historyTurn === historyGeneration) fail(error, context) }
    finally { if (current(context) && historyTurn === historyGeneration) state.historyLoading = false }
  }
  return { state, people, person, report, startsOn, endsOn, healthReadable, canWrite, canPublish, busy, load, clear, select, save, approve, loadHistory }
}
