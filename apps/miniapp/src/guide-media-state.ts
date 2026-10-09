import { reactive } from "vue"
import type { MediaAsset, MediaKind, MediaSession } from "@linan/contracts"
import { ApiError } from "./api-error"
import { chooseGuideMedia, type GuideMediaApi, type GuideMediaFile, type GuideMediaUpload } from "./guide-media-api"
import type { StaffAccess } from "./staff-api"

type Dependencies = { readonly api: GuideMediaApi; readonly me: () => Promise<StaffAccess>; readonly token: () => string | undefined; readonly login: () => void; readonly pick?: (kind: MediaKind) => Promise<GuideMediaFile | null> }
type PickerReturn = { readonly token: string; readonly sessionId: string; readonly title: string; file: GuideMediaFile | null; settled: boolean; error: string }

export function useGuideMedia(deps: Dependencies) {
  const state = reactive<{ session: MediaSession | null; assets: readonly MediaAsset[]; permissions: readonly string[]; title: string; file: GuideMediaFile | null; loading: boolean; saving: boolean; picking: boolean; previewing: boolean; preview: { path: string; kind: MediaKind; title: string } | null; error: string; notice: string; uploadFailed: boolean }>({ session: null, assets: [], permissions: [], title: "", file: null, loading: false, saving: false, picking: false, previewing: false, preview: null, error: "", notice: "", uploadFailed: false })
  let generation = 0
  let visible = false
  let owner: string | undefined
  let picker: PickerReturn | null = null
  let attempt: GuideMediaUpload | null = null

  function reset(): void {
    generation += 1
    owner = undefined
    attempt = null
    Object.assign(state, { session: null, assets: [], permissions: [], title: "", file: null, loading: false, saving: false, picking: false, previewing: false, preview: null, error: "", notice: "", uploadFailed: false })
  }
  function clear(): void { visible = false; picker = null; reset() }
  function hide(): void { visible = false; reset() }
  function current(turn: number, token: string): boolean {
    if (turn !== generation || !visible) return false
    if (deps.token() !== token) { clear(); return false }
    return true
  }
  function fail(error: unknown, turn: number, token: string): void {
    if (turn !== generation || !visible) return
    if (error instanceof ApiError && error.statusCode === 401 && (deps.token() === token || deps.token() === undefined)) { clear(); deps.login(); return }
    if (!current(turn, token)) return
    if (error instanceof ApiError && (error.statusCode === 403 || error.statusCode === 409)) { picker = null; reset() }
    state.error = error instanceof ApiError ? error.message : "操作未完成，请检查网络后重试。"
  }
  function restorePicker(): void {
    if (!picker || !visible || state.loading || state.session?.id !== picker.sessionId || deps.token() !== picker.token) return
    if (!state.permissions.includes("media.upload")) { picker = null; return }
    state.title = picker.title; state.file = picker.file; state.picking = !picker.settled
    if (picker.settled) { state.error = picker.error; picker = null }
  }
  async function load(sessionId: string): Promise<void> {
    reset(); visible = true
    const token = deps.token()
    if (!token) { picker = null; deps.login(); return }
    if (picker?.token !== token || picker.sessionId !== sessionId) picker = null
    if (!sessionId) { state.error = "未找到团期，请返回重新选择。"; return }
    const turn = generation
    state.loading = true
    try {
      const access = await deps.me()
      if (!current(turn, token)) return
      if (access.forcePasswordChange) { clear(); deps.login(); return }
      if (!access.permissionKeys.includes("media.read")) throw new ApiError(403, "当前账号无权查看活动素材。")
      const sessions = await deps.api.listSessions()
      if (!current(turn, token)) return
      const session = sessions.find(item => item.id === sessionId)
      if (!session) throw new ApiError(403, "此团期尚未分配给当前账号，请返回核对。")
      const assets = await deps.api.listAssets(sessionId)
      if (!current(turn, token)) return
      owner = token; state.session = session; state.assets = assets.filter(asset => asset.tourSessionId === sessionId); state.permissions = access.permissionKeys
    } catch (error) { fail(error, turn, token) }
    finally { if (current(turn, token)) { state.loading = false; restorePicker() } }
  }
  function allowed(permission: string): MediaSession | null {
    if (state.loading || state.saving || state.picking || state.previewing) return null
    if (!owner || deps.token() !== owner) { clear(); deps.login(); return null }
    if (!state.session || !state.permissions.includes(permission)) { state.error = "当前账号没有此项权限，请联系工作人员核对。"; return null }
    return state.session
  }
  async function choose(kind: MediaKind): Promise<void> {
    const session = allowed("media.upload")
    const token = deps.token()
    if (!session || !token) return
    const pending: PickerReturn = { token, sessionId: session.id, title: state.title, file: state.file, settled: false, error: "" }
    picker = pending; state.picking = true; state.error = ""; state.notice = ""
    try {
      const file = await (deps.pick ?? chooseGuideMedia)(kind)
      if (picker !== pending || deps.token() !== token) return
      if (file) { pending.file = file; attempt = null; state.uploadFailed = false }
    } catch (error) {
      if (picker !== pending || deps.token() !== token) return
      pending.error = error instanceof ApiError ? error.message : "未能选择文件，请重试。"
    } finally {
      if (picker === pending) {
        if (deps.token() !== token) clear()
        else { pending.settled = true; restorePicker() }
      }
    }
  }
  async function upload(): Promise<void> {
    const session = allowed("media.upload")
    const token = deps.token()
    const file = state.file
    if (!session || !token) return
    if (!file || !state.title.trim()) { state.error = "请选择照片或视频，并填写素材标题。"; return }
    if (attempt?.file.path !== file.path || attempt.title !== state.title.trim()) attempt = { file, title: state.title.trim(), requestId: createRequestId() }
    const input = attempt
    const turn = generation
    state.saving = true; state.error = ""; state.notice = ""; state.uploadFailed = false
    try {
      const asset = await deps.api.upload(session.id, input)
      if (!current(turn, token)) return
      state.assets = [asset, ...state.assets.filter(item => item.id !== asset.id)]
      if (asset.status === "failed") { attempt = null; state.uploadFailed = true; state.error = "该次上传未成功，请重试上传。"; return }
      if (asset.status === "uploading") { state.notice = "文件仍在处理中，请刷新核对结果。"; return }
      attempt = null; state.file = null; state.title = ""
      state.notice = asset.status === "draft" ? "已保存为草稿，发布后本团家长才可查看。" : "该素材已上传并处于已发布状态。"
    } catch (error) {
      if (turn === generation && visible && deps.token() === token) {
        state.uploadFailed = true
        if (error instanceof ApiError && error.statusCode === 503) attempt = null
      }
      fail(error, turn, token)
    } finally { if (current(turn, token)) state.saving = false }
  }
  async function change(asset: MediaAsset, action: "published" | "draft" | "delete"): Promise<void> {
    const session = allowed(action === "delete" ? "media.delete" : "media.publish")
    const token = deps.token()
    if (!session || !token) return
    const latest = state.assets.find(item => item.id === asset.id && item.version === asset.version && item.tourSessionId === session.id)
    if (!latest || (action === "delete" ? asset.status !== "draft" && asset.status !== "failed" : asset.status !== "draft" && asset.status !== "published")) { state.error = "素材状态已变化，请刷新后重新选择。"; return }
    const turn = generation
    state.saving = true; state.error = ""; state.notice = ""
    try {
      if (action === "delete") {
        await deps.api.remove(session.id, latest)
        if (!current(turn, token)) return
        state.assets = state.assets.filter(item => item.id !== asset.id); state.preview = null
        state.notice = "素材已删除。"
      } else {
        const saved = await deps.api.setStatus(session.id, latest, action)
        if (!current(turn, token)) return
        state.assets = state.assets.map(item => item.id === saved.id ? saved : item)
        state.notice = saved.status === "published" ? "已发布，本团家长可查看。" : "已下架，本团家长不再可见。"
      }
    } catch (error) { fail(error, turn, token) }
    finally { if (current(turn, token)) state.saving = false }
  }
  async function preview(asset: MediaAsset): Promise<void> {
    const session = allowed("media.read")
    const token = deps.token()
    if (!session || !token || !state.assets.some(item => item.id === asset.id && item.tourSessionId === session.id) || (asset.status !== "draft" && asset.status !== "published")) return
    const turn = generation
    state.previewing = true; state.preview = null; state.error = ""
    try {
      const path = await deps.api.download(session.id, asset.id)
      if (current(turn, token)) state.preview = { path, kind: asset.kind, title: asset.title }
    } catch (error) { fail(error, turn, token) }
    finally { if (current(turn, token)) state.previewing = false }
  }
  return { state, load, hide, clear, choose, upload, change, preview }
}

function createRequestId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, character => {
    const value = Math.floor(Math.random() * 16)
    return (character === "x" ? value : (value & 3) | 8).toString(16)
  })
}
