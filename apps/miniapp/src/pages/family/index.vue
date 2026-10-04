<script setup lang="ts">
import { ref } from "vue"
import { onShow } from "@dcloudio/uni-app"
import { ApiError, createMiniappApi, type SavedEnrollmentMember } from "../../api"
import DiscoveryState from "../../components/DiscoveryState.vue"
import ProfileLoginSheet from "../../components/ProfileLoginSheet.vue"
import TripServiceEntry from "../../components/TripServiceEntry.vue"
import FunctionalIcon from "../../components/FunctionalIcon.vue"
import type { LoadState } from "../../enrollment-flow"
import { readableError } from "../index/page-helpers"
import { getEnrollmentDraftOwner, getWechatSessionToken } from "../../wechat-token"
import { hasCompletedLocalProfile, loadLocalProfile, type LocalProfile } from "../../profile-display"
type MemberView = SavedEnrollmentMember & { readonly schoolName: string; readonly gradeName: string; readonly className: string }
const api = createMiniappApi()
const members = ref<readonly MemberView[]>([])
const state = ref<LoadState>("loading")
const error = ref("")
const authenticated = ref(false)
const profile = ref<LocalProfile | null>(null)
const loginPrompt = ref(false)
const loginTarget = ref("/pages/family/index")
let loadGeneration = 0
onShow(() => {
  const token = getWechatSessionToken()
  authenticated.value = import.meta.env["VITE_WECHAT_LOGIN_ENABLED"] !== "true" || (token !== undefined && hasCompletedLocalProfile(getEnrollmentDraftOwner()))
  if (!authenticated.value) {
    loadGeneration += 1
    members.value = []; profile.value = null; state.value = "empty"
    return
  }
  profile.value = loadLocalProfile(getEnrollmentDraftOwner())
  void load()
})
async function load(): Promise<void> {
  if (!authenticated.value) return
  const generation = ++loadGeneration
  const sessionToken = getWechatSessionToken()
  state.value = "loading"; error.value = ""
  try {
    const [saved, schools] = await Promise.all([api.listEnrollmentMembers(), api.listSchools()])
    if (generation !== loadGeneration || sessionToken !== getWechatSessionToken()) return
    const gradeRequests = new Map<string, ReturnType<typeof api.listGrades>>()
    const classRequests = new Map<string, ReturnType<typeof api.listClasses>>()
    const loadedMembers = await Promise.all(saved.map(async (member) => {
      if (member.participantKind === "adult" || member.schoolId === null) {
        return { ...member, schoolName: "成人参加人", gradeName: "无需填写年级", className: "无需填写班级" }
      }
      const gradeRequest = gradeRequests.get(member.schoolId) ?? api.listGrades(member.schoolId)
      gradeRequests.set(member.schoolId, gradeRequest)
      const classRequest = member.gradeId === null ? Promise.resolve([]) : classRequests.get(member.gradeId) ?? api.listClasses(member.gradeId)
      if (member.gradeId !== null) classRequests.set(member.gradeId, classRequest)
      const [grades, classes] = await Promise.all([gradeRequest, classRequest])
      return { ...member, schoolName: schools.find((school) => school.id === member.schoolId)?.name ?? "学校信息待完善", gradeName: grades.find((grade) => grade.id === member.gradeId)?.name ?? "年级待完善", className: classes.find((item) => item.id === member.classId)?.name ?? "班级待完善" }
    }))
    if (generation !== loadGeneration || sessionToken !== getWechatSessionToken()) return
    members.value = loadedMembers
    state.value = members.value.length > 0 ? "ready" : "empty"
  } catch (cause) {
    const currentToken = getWechatSessionToken()
    if (generation !== loadGeneration || (currentToken !== undefined && sessionToken !== currentToken)) return
    if (cause instanceof ApiError && cause.statusCode === 401) {
      members.value = []; profile.value = null; authenticated.value = false; state.value = "empty"
      error.value = "登录已失效，请重新登录后查看。"
      return
    }
    state.value = "error"; error.value = readableError(cause, "家庭成员加载失败，请重试") }
}
function activities(): void { uni.switchTab({ url: "/pages/activities/index" }) }
function orders(): void {
  if (!authenticated.value) { requestLogin("/pages/orders/index"); return }
  uni.switchTab({ url: "/pages/orders/index" })
}
function requestLogin(target = "/pages/family/index"): void { loginTarget.value = target; loginPrompt.value = true }
function login(): void { loginPrompt.value = true }
function completeProfile(): void {
  loginPrompt.value = false
  authenticated.value = true
  profile.value = loadLocalProfile(getEnrollmentDraftOwner())
  if (loginTarget.value === "/pages/orders/index") { uni.switchTab({ url: loginTarget.value }); return }
  void load()
}
function cancelProfile(): void { loginPrompt.value = false }
function business(): void { uni.navigateTo({ url: "/pages/business/index" }) }
function settings(): void { uni.navigateTo({ url: "/pages/settings/index" }) }
</script>

<template>
  <view class="discovery-page family-page">
    <view class="family-profile">
      <image v-if="authenticated && profile?.avatarPath" class="family-profile-avatar" :src="profile.avatarPath" mode="aspectFill" />
      <view v-else class="family-profile-icon"><FunctionalIcon name="people" /></view>
      <view class="family-profile-copy"><text class="page-heading">{{ authenticated ? profile?.nickname || "我的出行" : "我的出行" }}</text><text class="page-subtitle">{{ authenticated ? "一家人的研学安排" : "查看报名，管理参加人" }}</text></view>
      <button v-if="authenticated" class="family-settings-button" @tap="settings">设置</button>
      <button v-else class="button-primary family-login-entry" @tap="requestLogin()">登录/注册</button>
    </view>
    <view class="family-shortcuts"><button class="button-secondary family-orders-entry" @tap="orders"><FunctionalIcon name="orders" /><text>我的订单</text></button><button class="button-primary family-activities-entry" @tap="activities"><FunctionalIcon name="activities" /><text>选择活动报名</text></button></view>
    <TripServiceEntry />
    <text class="section-heading">常用参加人</text>
    <view v-if="!authenticated" class="info-card family-guest-card">
      <text class="body-secondary">{{ error || "保存常用参加人，下次报名更方便。" }}</text>
    </view>
    <DiscoveryState v-else :state="state" :message="error" empty-title="暂无常用参加人" @retry="load" />
    <view v-if="authenticated && state === 'ready'" class="family-members"><view v-for="member in members" :key="member.id" class="family-member-card"><text class="card-title">{{ member.displayName }}</text><text class="detail-line">{{ member.participantKind === 'adult' ? '成人参加人' : `${member.schoolName} · ${member.gradeName} · ${member.className}` }}</text></view></view>
    <text v-if="authenticated" class="family-help-note">报名时可保存常用参加人，未保存的信息可在订单中查看。</text>
    <button class="info-card family-service-entry" @tap="business"><FunctionalIcon name="travel" /><view><text class="shortcut-title">文旅服务</text><text class="body-secondary">旅游、疗休养与定制行程</text></view><text class="family-service-arrow">›</text></button>
    <ProfileLoginSheet v-if="loginPrompt" @completed="completeProfile" @cancelled="cancelProfile" />
    <text class="family-help-note">更正或删除已提交的信息，可在订单详情中联系客服。</text>
  </view>
</template>

<style>
@import "../../styles/discovery.css";
.family-shortcuts { display: flex; gap: var(--space-3); margin-top: var(--space-4); }
.family-shortcuts button { display: flex; flex: 1; flex-direction: column; align-items: center; gap: var(--space-2); min-width: 0; padding: var(--space-3); font-size: var(--font-body-sm); line-height: 1.5; }
.family-profile { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-3); padding: var(--space-5) var(--space-4); border-radius: var(--radius-banner); background: var(--brand-mist); }
.family-profile-icon { display: flex; padding: var(--space-4); border-radius: var(--radius-banner); background: var(--surface-elevated); }
.family-profile-avatar { width: var(--space-10); height: var(--space-10); overflow: hidden; border-radius: var(--radius-banner); background: var(--brand-mist); }
.family-profile-copy { flex: 1; min-width: 0; }
.family-profile-copy .page-heading { font-size: var(--font-h2); }
.family-login-entry, .family-settings-button { flex: 0 0 auto; min-height: var(--size-touch-target); margin: 0; padding: 0 var(--space-3); font-size: var(--font-body-sm); line-height: var(--size-touch-target); }
.family-settings-button { color: var(--accent-primary); background: var(--accent-soft); }
.family-settings-button::after { border: 0; }
.family-guest-card .card-title { margin-top: 0; }
.family-service-entry { display: flex; align-items: center; gap: var(--space-4); width: 100%; text-align: left; line-height: 1.5; }
.family-service-entry::after { border: 0; }
.family-service-entry > view { flex: 1; min-width: 0; }
.family-service-entry .shortcut-title { color: var(--text-primary); font-size: var(--font-body); }
.family-service-arrow { color: var(--text-secondary); font-size: var(--font-h2); }
.family-orders-entry { background: var(--surface-elevated); }
.family-shortcuts .family-activities-entry { color: var(--on-accent); }
.family-activities-entry .functional-icon { padding: var(--space-1); border-radius: var(--radius-control); background: var(--surface-elevated); }
.family-help-note { display: block; margin-top: var(--space-4); color: var(--text-secondary); font-size: var(--font-body-sm); line-height: 1.6; }
.family-guest-card { margin-top: 0; padding: var(--space-3) 0; border-radius: 0; background: transparent; }
.family-guest-card .body-secondary { margin-top: 0; }
.family-members { padding: 0 var(--space-4); border-radius: var(--radius-card); background: var(--surface-elevated); }
.family-member-card { padding: var(--space-4) 0; }
.family-member-card + .family-member-card { border-top: 1px solid var(--border-subtle); }
.family-member-card .card-title, .family-member-card .detail-line { margin-top: 0; }
</style>
