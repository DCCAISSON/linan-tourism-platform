import { reactive } from "vue"
import { ApiError } from "./api-error"
import type { StaffAccess } from "./staff-api"
import type { GuideSession, PersonRef } from "./guide-execution-api"
import type { EvaluationDashboard, EvaluationRow, GuideEvaluationsApi } from "./guide-evaluations-api"

type Dependencies = { readonly api: GuideEvaluationsApi; readonly getSession: (id: string) => Promise<GuideSession>; readonly me: () => Promise<StaffAccess>; readonly token: () => string | undefined; readonly login: () => void }
type EvaluationForm = {
  personRef: PersonRef; displayName: string; previous: EvaluationRow | null; standardId: string; gradeCode: "A" | "B" | null
  internalComment: string; excellent: boolean; attention: boolean; idempotencyKey: string
  dimensions: { code: string; label: string; description: string; observation: string }[]
}
type GroupCounts = { total: number; ungraded: number; pending: number }

export function useGuideEvaluations(deps: Dependencies) {
  const state = reactive<{ session: Pick<GuideSession, "id" | "code" | "confirmationStatus"> | null; dashboard: EvaluationDashboard | null; group: GroupCounts | null; form: EvaluationForm | null; canWrite: boolean; canConfirm: boolean; loading: boolean; saving: boolean; error: string; notice: string; generation: number }>({ session: null, dashboard: null, group: null, form: null, canWrite: false, canConfirm: false, loading: false, saving: false, error: "", notice: "", generation: 0 })
  let generation = 0
  let loadedToken: string | undefined

  function clear(): void {
    generation += 1
    loadedToken = undefined
    Object.assign(state, { session: null, dashboard: null, group: null, form: null, canWrite: false, canConfirm: false, loading: false, saving: false, error: "", notice: "", generation })
  }
  function current(turn: number, token: string): boolean {
    if (turn !== generation) return false
    if (deps.token() === token) return true
    clear()
    state.error = "登录信息已变化，请重新进入工作台。"
    return false
  }
  function fail(error: unknown, turn: number, token: string): void {
    if (turn !== generation || (deps.token() !== token && !(deps.token() === undefined && error instanceof ApiError && error.statusCode === 401))) { current(turn, token); return }
    if (error instanceof ApiError && error.statusCode === 401) { clear(); deps.login(); return }
    if (error instanceof ApiError && (error.statusCode === 403 || error.statusCode === 409)) {
      clear()
      state.error = error.statusCode === 403 ? "当前账号已无权查看或填写此团期，请联系工作人员核对分配。" : "评价或人员安排已变化，请刷新后重新核对。"
      return
    }
    state.error = error instanceof ApiError ? error.message : "操作未完成，请检查网络后重试。"
  }
  async function load(id: string): Promise<void> {
    clear()
    const token = deps.token()
    if (!token) { deps.login(); return }
    if (!id) { state.error = "未找到团期，请返回重新选择。"; return }
    const turn = generation
    state.loading = true
    try {
      const staff = await deps.me()
      if (!current(turn, token)) return
      if (staff.forcePasswordChange) { clear(); deps.login(); return }
      if (!staff.permissionKeys.includes("evaluations.read")) throw new ApiError(403, "无权查看学生评价")
      const [session, dashboard] = await Promise.all([deps.getSession(id), deps.api.getDashboard(id)])
      if (!current(turn, token)) return
      if (session.id !== id) throw new ApiError(409, "团期已变化")
      const ownRefs = new Set<string>(session.people.filter(person => person.active && session.vehicleIds.includes(person.vehicleId)).map(person => person.personRef))
      const students = dashboard.students.filter(student => ownRefs.has(student.personRef))
      const studentRefs = new Set<string>(students.map(student => student.personRef))
      state.group = { total: dashboard.students.length, ungraded: dashboard.students.filter(student => !dashboard.evaluations.some(row => row.personRef === student.personRef && row.gradeCode !== null)).length, pending: dashboard.students.filter(student => dashboard.evaluations.some(row => row.personRef === student.personRef && row.gradeCode !== null && row.confirmedAt === null)).length }
      state.dashboard = { ...dashboard, students, evaluations: dashboard.evaluations.filter(row => studentRefs.has(row.personRef)) }
      state.session = { id: session.id, code: session.code, confirmationStatus: session.confirmationStatus }
      state.canWrite = staff.permissionKeys.includes("evaluations.write") && session.confirmationStatus === "current"
      state.canConfirm = staff.permissionKeys.includes("evaluations.confirm")
      loadedToken = token
    } catch (error) { fail(error, turn, token) }
    finally { if (current(turn, token)) state.loading = false }
  }
  function ready(): string | null {
    if (state.loading || state.saving) return null
    const token = deps.token()
    if (!token) { clear(); deps.login(); return null }
    if (loadedToken !== token) { clear(); state.error = "登录信息已变化，请重新进入工作台。"; return null }
    return token
  }
  function edit(personRef: PersonRef): void {
    if (!ready() || !state.canWrite) return
    const student = state.dashboard?.students.find(student => student.personRef === personRef)
    if (!student) return
    const previous = state.dashboard?.evaluations.find(row => row.personRef === personRef) ?? null
    state.error = ""; state.notice = ""
    state.form = { personRef, displayName: student.displayName, previous, standardId: previous?.standardId ?? "", gradeCode: previous?.gradeCode ?? null, internalComment: previous?.internalComment ?? "", excellent: previous?.excellent ?? false, attention: previous?.attention ?? false, dimensions: [], idempotencyKey: `guide-${Date.now()}-${Math.random().toString(36).slice(2)}` }
    selectStandard(state.form.standardId)
  }
  function selectStandard(id: string): void {
    const form = state.form
    if (!form || state.saving || (form.previous?.standardId && form.previous.standardId !== id)) return
    const standard = state.dashboard?.standards.find(standard => standard.id === id && standard.confirmedAt !== null)
    form.standardId = standard?.id ?? ""
    if (!standard) form.gradeCode = null
    form.dimensions = standard?.dimensions.map(dimension => ({ ...dimension, observation: form.previous?.dimensionObservations.find(observation => observation.code === dimension.code)?.observation ?? "" })) ?? []
  }
  async function save(): Promise<void> {
    const token = ready()
    const form = state.form
    const session = state.session
    if (!token || !form || !session || !state.dashboard || !state.group || !state.canWrite) return
    if (!state.dashboard.students.some(student => student.personRef === form.personRef)) return
    if (form.gradeCode !== null && !state.dashboard.standards.some(standard => standard.id === form.standardId && standard.confirmedAt !== null)) { state.error = "请先选择已确认的评价标准。"; return }
    const turn = generation
    const input = { gradeCode: form.gradeCode, internalComment: form.internalComment.trim(), excellent: form.excellent, attention: form.attention, dimensionObservations: form.dimensions.filter(dimension => dimension.observation.trim()).map(dimension => ({ code: dimension.code, observation: dimension.observation.trim() })) }
    state.saving = true; state.error = ""; state.notice = ""
    try {
      const row = form.previous
        ? await deps.api.revise(form.previous, { ...input, ...(form.previous.standardId === null && form.standardId ? { standardId: form.standardId } : {}) })
        : await deps.api.create({ tourSessionId: session.id, standardId: form.standardId || null, observations: [{ personRef: form.personRef, ...input }], idempotencyKey: form.idempotencyKey })
      if (!current(turn, token) || !state.dashboard || !state.group) return
      state.dashboard = { ...state.dashboard, evaluations: [...state.dashboard.evaluations.filter(previous => previous.personRef !== row.personRef), row] }
      const previouslyGraded = form.previous?.gradeCode != null
      const previouslyPending = previouslyGraded && form.previous?.confirmedAt === null
      state.group.ungraded += Number(row.gradeCode === null) - Number(!previouslyGraded)
      state.group.pending += Number(row.gradeCode !== null && row.confirmedAt === null) - Number(previouslyPending)
      state.form = null
      state.notice = "评价已保存，待授权人员确认。"
    } catch (error) { fail(error, turn, token) }
    finally { if (current(turn, token)) state.saving = false }
  }
  async function confirm(approved: boolean): Promise<void> {
    if (!approved) return
    const token = ready()
    if (!token || !state.canConfirm || !state.session || !state.dashboard || !state.group || state.form) return
    if (state.group.ungraded > 0 || state.group.pending === 0) { state.error = "请先核对全团未评级和待确认人数。"; return }
    const turn = generation
    const id = state.session.id
    state.saving = true; state.error = ""; state.notice = ""
    try {
      const rows = await deps.api.confirm(id)
      if (!current(turn, token) || !state.dashboard) return
      const ownRefs = new Set<string>(state.dashboard.students.map(student => student.personRef))
      state.dashboard = { ...state.dashboard, evaluations: rows.filter(row => ownRefs.has(row.personRef)) }
      state.group = { total: rows.length, ungraded: 0, pending: 0 }
      state.notice = "全团学生评价已确认。"
    } catch (error) { fail(error, turn, token) }
    finally { if (current(turn, token)) state.saving = false }
  }
  return { state, load, clear, edit, selectStandard, save, confirm }
}
