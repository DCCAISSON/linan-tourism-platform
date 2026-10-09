import { reactive } from "vue"
import { ApiError } from "./api-error"
import type { StaffAccess } from "./staff-api"
import type { EventInput, GuideApi, GuideSession, NodeData, OccurrenceInput, PersonRef } from "./guide-execution-api"

type Dependencies = { readonly api: GuideApi; readonly me: () => Promise<StaffAccess>; readonly token: () => string | undefined; readonly login: () => void }
export type NodeSelection = { readonly date: string; readonly nodeId: string }

export function useGuideExecution(deps: Dependencies) {
  const state = reactive<{ session: GuideSession | null; nodes: NodeData | null; selection: NodeSelection | null; canWrite: boolean; loading: boolean; saving: boolean; error: string; notice: string; generation: number }>({ session: null, nodes: null, selection: null, canWrite: false, loading: false, saving: false, error: "", notice: "", generation: 0 })
  let generation = 0

  function clear(): void {
    generation += 1
    Object.assign(state, { session: null, nodes: null, selection: null, canWrite: false, loading: false, saving: false, error: "", notice: "", generation })
  }
  function current(turn: number, token: string): boolean { return turn === generation && deps.token() === token }
  function fail(error: unknown): void {
    if (error instanceof ApiError && error.statusCode === 401) { clear(); deps.login(); return }
    if (error instanceof ApiError && (error.statusCode === 403 || error.statusCode === 409)) {
      clear()
      state.error = error.statusCode === 403 ? "当前账号已无权操作此团期，请联系工作人员核对分配。" : "记录或人车安排已变化，请刷新后重新核对。"
      return
    }
    state.error = error instanceof ApiError ? error.message : "操作未完成，请检查网络后重试。"
  }
  function handleError(error: unknown, turn: number, token: string): void {
    if (current(turn, token) || (turn === generation && deps.token() === undefined && error instanceof ApiError && error.statusCode === 401)) fail(error)
  }
  async function load(sessionId: string): Promise<void> {
    const selection = state.session?.id === sessionId ? state.selection : null
    clear()
    state.selection = selection
    const token = deps.token()
    if (!token) { deps.login(); return }
    if (!sessionId) { state.error = "未找到团期，请返回重新选择。"; return }
    const turn = generation
    state.loading = true
    try {
      const staff = await deps.me()
      if (!current(turn, token)) return
      if (staff.forcePasswordChange) { deps.login(); return }
      if (!staff.permissionKeys.includes("execution.read")) throw new ApiError(403, "无权读取执行记录")
      const [session, nodes] = await Promise.all([deps.api.getSession(sessionId), deps.api.getNodes(sessionId)])
      if (!current(turn, token)) return
      state.session = session
      const ownRefs = new Set<string>(session.people.filter(person => session.vehicleIds.includes(person.vehicleId)).map(person => person.personRef))
      state.nodes = { ...nodes, records: nodes.records.filter(record => ownRefs.has(record.personRef)), progress: nodes.progress.map(progress => {
        const missingPeople = progress.missingPeople.filter(person => ownRefs.has(person))
        return { ...progress, expected: ownRefs.size, completed: ownRefs.size - missingPeople.length, missingPeople, absentPeople: progress.absentPeople.filter(person => ownRefs.has(person)) }
      }) }
      state.canWrite = staff.permissionKeys.includes("execution.write") && session.confirmationStatus === "current"
    } catch (error) { handleError(error, turn, token) }
    finally { if (current(turn, token)) state.loading = false }
  }
  function writable(personRef: PersonRef): GuideSession | null {
    const session = state.session
    if (state.saving || state.loading) return null
    if (session === null || !state.canWrite || session.confirmationStatus !== "current") { state.error = "当前不能填写，请刷新后核对权限和人车安排。"; return null }
    if (!session.people.some(person => person.personRef === personRef && person.active && session.vehicleIds.includes(person.vehicleId))) { state.error = "只能填写本人所带车辆内的有效人员。"; return null }
    return session
  }
  async function save(personRef: PersonRef, submit: (sessionId: string) => Promise<void>): Promise<void> {
    const session = writable(personRef)
    if (!session) return
    const token = deps.token()
    if (!token) { clear(); deps.login(); return }
    const turn = generation
    state.saving = true; state.error = ""; state.notice = ""
    try {
      await submit(session.id)
      if (!current(turn, token)) return
      await load(session.id)
      if (generation !== turn + 1) return
      if (state.session?.id === session.id && deps.token() === token) state.notice = "记录已保存。"
      else if (state.error && deps.token() === token) state.notice = "记录已提交，请刷新核对最新结果。"
    } catch (error) { handleError(error, turn, token) }
    finally { if (current(turn, token)) state.saving = false }
  }
  async function saveOccurrence(payload: OccurrenceInput): Promise<void> {
    if (payload.correctsId) {
      const previous = state.nodes?.records.find(record => record.id === payload.correctsId)
      if (!previous || previous.version !== payload.expectedVersion || previous.personRef !== payload.personRef || previous.nodeId !== payload.nodeId || previous.reportDate !== payload.reportDate || previous.type !== payload.type || state.nodes?.records.some(record => record.correctsId === previous.id)) { state.error = "该记录已变化，请刷新后重新选择。"; return }
      if (!payload.correctionReason.trim()) { state.error = "请填写更正原因。"; return }
    } else if (payload.expectedVersion !== 0) { state.error = "请重新选择要填写的记录。"; return }
    await save(payload.personRef, sessionId => deps.api.saveOccurrence(sessionId, payload))
  }
  async function createEvent(payload: EventInput): Promise<void> { await save(payload.personRef, sessionId => deps.api.createEvent(sessionId, payload)) }
  return { state, load, clear, saveOccurrence, createEvent }
}

export function chinaDate(value: string): string { return new Date(Date.parse(value) + 8 * 60 * 60 * 1000).toISOString().slice(0, 10) }
export function chinaTime(value: string): string { return new Date(Date.parse(value) + 8 * 60 * 60 * 1000).toISOString().slice(11, 19) }
export function displayTime(value: string): string { return `${chinaDate(value)} ${chinaTime(value)}` }
