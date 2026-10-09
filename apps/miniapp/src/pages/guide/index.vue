<script setup lang="ts">
import { ref } from "vue"
import { onHide, onShow, onUnload } from "@dcloudio/uni-app"
import ServiceConsent from "../../components/ServiceConsent.vue"
import { ApiError } from "../../api-error"
import { createStaffApi } from "../../staff-api"
import { getStaffSession, getStaffSessionToken, saveStaffSession } from "../../staff-session"
import { clearServiceConsent, hasServiceConsent } from "../../service-consent"
import { createGuideApi, type GuideSessionSummary } from "../../guide-execution-api"

const api = createStaffApi()
const sessions = ref<readonly GuideSessionSummary[]>([])
const username = ref(""), password = ref(""), newPassword = ref(""), confirmation = ref("")
const displayName = ref(""), error = ref(""), message = ref("")
const authenticated = ref(false), forceChange = ref(false), allowed = ref(false)
const loading = ref(false), busy = ref(false), consent = ref(hasServiceConsent())
let generation = 0

onShow(() => { consent.value = hasServiceConsent(); void load() })
onHide(clearVisible)
onUnload(clearVisible)

function clearVisible(): void {
  generation += 1
  sessions.value = []; password.value = ""; newPassword.value = ""; confirmation.value = ""
  error.value = ""; message.value = ""; loading.value = false; busy.value = false
}
async function load(): Promise<void> {
  const current = ++generation
  const stored = getStaffSession()
  sessions.value = []; error.value = ""; allowed.value = false
  authenticated.value = stored !== undefined; forceChange.value = false
  if (stored === undefined) { loading.value = false; return }
  username.value = stored.account.username; displayName.value = stored.account.displayName
  loading.value = true
  try {
    const access = await api.me()
    if (current !== generation || getStaffSessionToken() !== stored.token) return
    forceChange.value = access.forcePasswordChange
    if (forceChange.value) return
    allowed.value = access.permissionKeys.includes("execution.read")
    if (!allowed.value) { error.value = "当前账号尚未开通导游执行权限，请联系工作人员。"; return }
    const rows = await createGuideApi().listSessions()
    if (current === generation && getStaffSessionToken() === stored.token) sessions.value = rows
  } catch (cause) {
    if (current !== generation || (getStaffSessionToken() !== undefined && getStaffSessionToken() !== stored.token)) return
    sessions.value = []
    if (cause instanceof ApiError && cause.statusCode === 401) authenticated.value = false
    error.value = readable(cause)
  } finally { if (current === generation) loading.value = false }
}
async function login(): Promise<void> {
  if (busy.value || !consent.value) return
  if (!username.value.trim() || !password.value) { error.value = "请填写工作人员账号和密码。"; return }
  const current = ++generation
  busy.value = true; error.value = ""; message.value = ""
  try {
    const result = await api.login(username.value.trim(), password.value)
    if (current !== generation) return
    saveStaffSession(result); password.value = ""; busy.value = false
    await load()
  } catch (cause) { if (current === generation) error.value = readable(cause) }
  finally { if (current === generation) busy.value = false }
}
async function changePassword(): Promise<void> {
  if (busy.value) return
  if (!password.value || newPassword.value.length < 12) { error.value = "请填写当前密码和至少12位的新密码。"; return }
  if (newPassword.value !== confirmation.value) { error.value = "两次输入的新密码不一致。"; return }
  const current = ++generation
  busy.value = true; error.value = ""
  try {
    await api.changePassword(username.value, password.value, newPassword.value)
    if (current !== generation) return
    authenticated.value = false; forceChange.value = false
    password.value = ""; newPassword.value = ""; confirmation.value = ""
    message.value = "密码已更新，请使用新密码登录。"
  } catch (cause) { if (current === generation) error.value = readable(cause) }
  finally { if (current === generation) busy.value = false }
}
async function logout(): Promise<void> {
  if (busy.value) return
  const openedAt = generation
  const token = getStaffSessionToken()
  const result = await new Promise<UniApp.ShowModalRes>(resolve => uni.showModal({ title: "退出导游账号", content: "确认退出当前导游账号？", success: resolve }))
  if (!result.confirm || openedAt !== generation || token !== getStaffSessionToken()) return
  clearVisible(); authenticated.value = false; allowed.value = false; forceChange.value = false
  clearServiceConsent(); consent.value = false
  const current = generation
  try { await api.logout() }
  catch (cause) { if (current === generation) error.value = cause instanceof Error ? "本机已退出，服务器退出结果未确认，请联系管理员处理账号。" : "本机已退出，暂时无法确认服务器状态。" }
}
function acceptConsent(): void { consent.value = true }
function back(): void { uni.switchTab({ url: "/pages/family/index" }) }
function openSession(id: string): void { uni.navigateTo({ url: `/pages/guide/session?id=${encodeURIComponent(id)}` }) }
function dateLabel(value: string): string { return new Date(value).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", month: "long", day: "numeric" }) }
function readable(cause: unknown): string { return cause instanceof ApiError ? cause.message : "暂时无法完成操作，请稍后重试。" }
</script>

<template>
  <view class="discovery-page guide-home">
    <view class="guide-heading"><text class="page-heading">导游工作台</text><text class="page-subtitle">查看负责的团期，记录现场执行情况</text></view>
    <text v-if="error" class="guide-error" role="alert">{{ error }}</text>
    <text v-if="message" class="guide-message" role="status">{{ message }}</text>
    <text v-if="loading" class="body-secondary" role="status">正在读取工作安排…</text>
    <template v-else-if="!authenticated">
      <view v-if="consent" class="guide-login">
        <text class="card-title">工作人员登录</text>
        <text class="body-secondary">使用管理员分配的账号。家长报名账号不能用于导游操作。</text>
        <label class="guide-field"><text>账号</text><input v-model="username" class="guide-input" maxlength="80" :disabled="busy" placeholder="请输入工作人员账号" /></label>
        <label class="guide-field"><text>密码</text><input v-model="password" class="guide-input" password maxlength="128" :disabled="busy" placeholder="请输入密码" @confirm="login" /></label>
        <button class="button-primary guide-login-submit" :disabled="busy" @tap="login">{{ busy ? '正在登录…' : '登录工作台' }}</button>
      </view>
      <ServiceConsent v-else required @accepted="acceptConsent" @declined="back" />
    </template>
    <template v-else-if="forceChange">
      <view class="guide-login">
        <text class="card-title">设置自己的密码</text><text class="body-secondary">{{ displayName }}，首次使用临时密码，请先更新密码。</text>
        <label class="guide-field"><text>当前密码</text><input v-model="password" class="guide-input" password maxlength="128" :disabled="busy" /></label>
        <label class="guide-field"><text>新密码（至少12位）</text><input v-model="newPassword" class="guide-input" password maxlength="128" :disabled="busy" /></label>
        <label class="guide-field"><text>再次输入新密码</text><input v-model="confirmation" class="guide-input" password maxlength="128" :disabled="busy" /></label>
        <button class="button-primary" :disabled="busy" @tap="changePassword">{{ busy ? '正在保存…' : '更新密码' }}</button>
      </view>
    </template>
    <template v-else>
      <view class="guide-toolbar"><text class="card-title">{{ displayName }} · 我的团期</text><button class="button-secondary" @tap="load">刷新</button></view>
      <view v-if="allowed && sessions.length === 0 && !error" class="guide-empty"><text class="card-title">暂无分配的团期</text><text class="body-secondary">请联系工作人员指派团期及负责车辆，完成后刷新查看。</text></view>
      <button v-for="session in sessions" :key="session.id" class="guide-session-entry" @tap="openSession(session.id)">
        <text class="guide-session-title">{{ session.code }}</text>
        <text class="body-secondary">{{ dateLabel(session.startsAt) }} — {{ dateLabel(session.endsAt) }}</text>
        <text class="guide-session-scope">{{ session.vehicleIds.length ? `负责 ${session.vehicleIds.length} 辆车` : '全团查看 · 无本车操作权限' }}</text>
        <text class="guide-session-action">进入执行台 ›</text>
      </button>
    </template>
    <button v-if="authenticated && !loading" class="button-secondary guide-logout" :disabled="busy" @tap="logout">退出导游账号</button>
  </view>
</template>

<style>
@import "../../styles/discovery.css";
.guide-home { padding-bottom: calc(var(--space-6) + env(safe-area-inset-bottom)); }
.guide-heading { margin-bottom: var(--space-5); }
.guide-login, .guide-empty { padding: var(--space-4); background: var(--surface-elevated); border-radius: var(--radius-card); }
.guide-field { display: block; margin: var(--space-4) 0; color: var(--text-primary); font-size: var(--font-body); }
.guide-field > text { display: block; margin-bottom: var(--space-2); }
.guide-input { box-sizing: border-box; min-height: var(--size-touch-target); padding: var(--space-3); border: 1px solid var(--border-default); border-radius: var(--radius-control); font-size: var(--font-body); background: var(--surface-primary); }
.guide-toolbar { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-3); }
.guide-toolbar .card-title { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.guide-toolbar button { margin: 0; padding: var(--space-2) var(--space-3); font-size: var(--font-body-sm); }
.guide-session-entry { display: block; width: 100%; box-sizing: border-box; padding: var(--space-4); margin-bottom: var(--space-3); background: var(--surface-elevated); border-radius: var(--radius-card); text-align: left; line-height: 1.6; }
.guide-session-entry::after { border: 0; }
.guide-session-title { display: block; color: var(--text-primary); font-size: var(--font-h3); font-weight: 600; overflow-wrap: anywhere; }
.guide-session-scope { display: block; color: var(--text-secondary); font-size: var(--font-body-sm); margin-top: var(--space-2); }
.guide-session-action { display: block; color: var(--accent-primary); font-size: var(--font-body); margin-top: var(--space-3); }
.guide-logout { margin-top: var(--space-5); }
.guide-error, .guide-message { display: block; margin: var(--space-3) 0; font-size: var(--font-body); line-height: 1.6; overflow-wrap: anywhere; }
.guide-error { color: var(--status-error); }.guide-message { color: var(--status-success); }
</style>
