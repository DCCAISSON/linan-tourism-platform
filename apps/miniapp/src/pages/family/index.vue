<script setup lang="ts">
import { ref } from "vue"
import { onShow } from "@dcloudio/uni-app"
import { ApiError, createMiniappApi, type SavedEnrollmentMember } from "../../api"
import DiscoveryState from "../../components/DiscoveryState.vue"
import LoginPrompt from "../../components/LoginPrompt.vue"
import FunctionalIcon from "../../components/FunctionalIcon.vue"
import type { LoadState } from "../../enrollment-flow"
import { readableError } from "../index/page-helpers"
import { getWechatSessionToken } from "../../wechat-token"
type MemberView = SavedEnrollmentMember & { readonly schoolName: string; readonly gradeName: string; readonly className: string }
const api = createMiniappApi()
const members = ref<readonly MemberView[]>([])
const state = ref<LoadState>("loading")
const error = ref("")
const authenticated = ref(false)
const loginPrompt = ref(false)
const loginTarget = ref("/pages/family/index")
let loadGeneration = 0
onShow(() => {
  authenticated.value = import.meta.env["VITE_WECHAT_LOGIN_ENABLED"] !== "true" || getWechatSessionToken() !== undefined
  if (!authenticated.value) {
    loadGeneration += 1
    members.value = []; state.value = "empty"
    return
  }
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
    const loadedMembers = await Promise.all(saved.map(async (member) => {
      if (member.participantKind === "adult" || member.schoolId === null) {
        return { ...member, schoolName: "成人参与人", gradeName: "无需年级", className: "无需班级" }
      }
      const grades = await api.listGrades(member.schoolId)
      const classes = member.gradeId === null ? [] : await api.listClasses(member.gradeId)
      return { ...member, schoolName: schools.find((school) => school.id === member.schoolId)?.name ?? "学校信息待完善", gradeName: grades.find((grade) => grade.id === member.gradeId)?.name ?? "年级未设置", className: classes.find((item) => item.id === member.classId)?.name ?? "班级未设置" }
    }))
    if (generation !== loadGeneration || sessionToken !== getWechatSessionToken()) return
    members.value = loadedMembers
    state.value = members.value.length > 0 ? "ready" : "empty"
  } catch (cause) {
    const currentToken = getWechatSessionToken()
    if (generation !== loadGeneration || (currentToken !== undefined && sessionToken !== currentToken)) return
    if (cause instanceof ApiError && cause.statusCode === 401) {
      members.value = []; authenticated.value = false; state.value = "empty"
      error.value = "登录已过期，请重新登录后查看。"
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
function login(): void { loginPrompt.value = false; uni.navigateTo({ url: `/pages/login/index?returnTo=${encodeURIComponent(loginTarget.value)}` }) }
function business(): void { uni.navigateTo({ url: "/pages/business/index" }) }
</script>

<template>
  <view class="discovery-page">
    <view class="family-profile">
      <view class="family-profile-icon"><FunctionalIcon name="people" /></view>
      <view class="family-profile-copy"><text class="page-heading">{{ authenticated ? "我的出行" : "欢迎来临安" }}</text><text class="page-subtitle">{{ authenticated ? "管理一家人的研学报名" : "研学行程，随时来看看" }}</text></view>
      <button v-if="!authenticated" class="button-primary family-login-entry" @tap="requestLogin()">登录</button>
    </view>
    <view class="info-card family-shortcuts"><button class="button-secondary family-orders-entry" @tap="orders"><FunctionalIcon name="orders" /><text>我的订单</text></button><button class="button-secondary family-activities-entry" @tap="activities"><FunctionalIcon name="activities" /><text>选择活动报名</text></button></view>
    <text class="section-heading">常用参加人</text>
    <view v-if="!authenticated" class="info-card family-guest-card">
      <text class="card-title">登录后查看常用参加人</text>
      <text class="body-secondary">{{ error || "保存常用参加人，下次报名少填写。" }}</text>
      <button class="button-secondary action-gap" @tap="requestLogin()">查看常用参加人</button>
    </view>
    <DiscoveryState v-else :state="state" :message="error" empty-title="暂无常用参加人" @retry="load" />
    <view v-if="authenticated && state === 'ready'"><view v-for="member in members" :key="member.id" class="info-card family-member-card"><text class="card-title">{{ member.displayName }}</text><text class="detail-line">{{ member.schoolName }} · {{ member.gradeName }} · {{ member.className }}</text></view></view>
    <text class="test-notice">报名时可自行选择是否保存为常用参加人；未保存的参加人仍保留在对应订单中。</text>
    <button class="info-card family-service-entry" @tap="business"><FunctionalIcon name="travel" /><view><text class="shortcut-title">商旅服务</text><text class="body-secondary">旅游、疗休养与定制行程</text></view><text class="family-service-arrow">›</text></button>
    <LoginPrompt v-if="loginPrompt" message="登录后，查看您的报名与参加人" @cancel="loginPrompt = false" @confirm="login" />
  </view>
</template>

<style>
@import "../../styles/discovery.css";
.family-shortcuts { display: flex; gap: var(--space-3); }
.family-shortcuts button { display: flex; flex: 1; flex-direction: column; align-items: center; gap: var(--space-2); min-width: 0; padding: var(--space-3); font-size: var(--font-body-sm); line-height: 1.5; }
.family-profile { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-5) 0; }
.family-profile-icon { display: flex; padding: var(--space-4); border-radius: var(--radius-banner); background: var(--brand-mist); }
.family-profile-copy { flex: 1; min-width: 0; }
.family-profile-copy .page-heading { font-size: var(--font-h2); }
.family-login-entry { font-size: var(--font-body-sm); }
.family-guest-card .card-title { margin-top: 0; }
.family-service-entry { display: flex; align-items: center; gap: var(--space-4); width: 100%; text-align: left; line-height: 1.5; }
.family-service-entry::after { border: 0; }
.family-service-entry > view { flex: 1; min-width: 0; }
.family-service-entry .shortcut-title { color: var(--text-primary); font-size: var(--font-body); }
.family-service-arrow { color: var(--text-secondary); font-size: var(--font-h2); }
</style>
