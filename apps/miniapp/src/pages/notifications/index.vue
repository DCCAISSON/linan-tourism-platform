<script setup lang="ts">
import { computed, ref } from "vue"
import { onShow } from "@dcloudio/uni-app"
import { createUserNotificationApi, requestUserSubscriptions, type UserNotificationTemplate, type SubscriptionChoice } from "../../user-notification-api"
import { getEnrollmentDraftOwner, getWechatSessionToken } from "../../wechat-token"
import { hasCompletedLocalProfile } from "../../profile-display"
import { ApiError } from "../../api-error"
import { readableError } from "../index/page-helpers"
import DiscoveryState from "../../components/DiscoveryState.vue"

const api = createUserNotificationApi()
const templates = ref<readonly UserNotificationTemplate[]>([])
const selectedIds = ref<readonly string[]>([])
const state = ref<"loading" | "ready" | "empty" | "error">("loading")
const authenticated = ref(false)
const busy = ref(false)
const error = ref("")
const message = ref("")
const pendingChoices = ref<readonly SubscriptionChoice[]>([])
const selected = computed(() => templates.value.filter((item) => item.enabled && item.subscription?.status !== "active" && selectedIds.value.includes(item.id)))
const statusLabels = { active: "已订阅", rejected: "未订阅", withdrawn: "已停止接收", consumed: "可再次订阅" } as const
let generation = 0
let ownerToken: string | undefined

onShow(() => { void load() })
async function load(): Promise<void> {
  const current = ++generation
  const token = getWechatSessionToken()
  if (ownerToken !== token) {
    pendingChoices.value = []; templates.value = []; selectedIds.value = []; message.value = ""
    ownerToken = token
  }
  authenticated.value = token !== undefined && hasCompletedLocalProfile(getEnrollmentDraftOwner())
  if (!authenticated.value) { templates.value = []; pendingChoices.value = []; state.value = "empty"; return }
  state.value = "loading"; error.value = ""
  try {
    const rows = await api.overview()
    if (current !== generation || token !== getWechatSessionToken()) return
    templates.value = rows
    selectedIds.value = rows.filter((item) => item.enabled && item.subscription?.status !== "active").slice(0, 3).map((item) => item.id)
    state.value = rows.length === 0 ? "empty" : "ready"
  } catch (cause) {
    if (current === generation && cause instanceof ApiError && cause.statusCode === 401 && getWechatSessionToken() === undefined) {
      authenticated.value = false; templates.value = []; pendingChoices.value = []; state.value = "empty"; return
    }
    if (current !== generation || token !== getWechatSessionToken()) return
    error.value = readableError(cause, "消息订阅加载失败，请重试。")
    state.value = "error"
  }
}
function toggle(id: string): void {
  if (busy.value || pendingChoices.value.length > 0 || !templates.value.some((item) => item.id === id && item.enabled && item.subscription?.status !== "active")) return
  if (selectedIds.value.includes(id)) selectedIds.value = selectedIds.value.filter((item) => item !== id)
  else if (selectedIds.value.length < 3) selectedIds.value = [...selectedIds.value, id]
  else message.value = "每次最多选择3类通知。"
}
async function subscribe(): Promise<void> {
  if (busy.value || (selected.value.length === 0 && pendingChoices.value.length === 0)) return
  busy.value = true; error.value = ""; message.value = ""
  const token = getWechatSessionToken()
  try {
    if (pendingChoices.value.length === 0) pendingChoices.value = await requestUserSubscriptions(selected.value)
    if (token !== getWechatSessionToken()) { pendingChoices.value = []; throw new Error("登录状态已变化，请重新进入消息订阅。") }
    const code = await new Promise<string>((resolve, reject) => uni.login({ provider: "weixin", success: (result) => result.code ? resolve(result.code) : reject(new Error("微信身份核验失败，请重试。")), fail: reject }))
    if (token !== getWechatSessionToken()) { pendingChoices.value = []; return }
    const rows = await api.subscribe(code, pendingChoices.value)
    if (token !== getWechatSessionToken()) { pendingChoices.value = []; return }
    const accepted = pendingChoices.value.filter((item) => item.result === "accept").length
    templates.value = rows
    pendingChoices.value = []
    message.value = accepted > 0 ? `已订阅${accepted}类提醒，后续提醒可通过微信接收。` : "本次未同意订阅，你仍可正常浏览和报名。"
  } catch (cause) {
    if (cause instanceof ApiError && cause.statusCode === 401 && getWechatSessionToken() === undefined) {
      authenticated.value = false; pendingChoices.value = []; templates.value = []
    }
    error.value = readableError(cause, "订阅未保存，请重试。")
  }
  finally { busy.value = false }
}
async function withdraw(item: UserNotificationTemplate): Promise<void> {
  if (busy.value || pendingChoices.value.length > 0 || item.subscription === null) return
  busy.value = true; error.value = ""; message.value = ""
  const token = getWechatSessionToken()
  try {
    const rows = await api.withdraw(item.subscription.id, item.subscription.version)
    if (token !== getWechatSessionToken()) return
    templates.value = rows
    message.value = "已停止这类消息，之后可随时重新订阅。"
  } catch (cause) {
    if (cause instanceof ApiError && cause.statusCode === 401 && getWechatSessionToken() === undefined) {
      authenticated.value = false; templates.value = []
    }
    error.value = readableError(cause, "停止接收失败，请重试。")
  }
  finally { busy.value = false }
}
function login(): void { uni.navigateTo({ url: "/pages/login/index?returnTo=%2Fpages%2Fnotifications%2Findex" }) }
function settings(): void { uni.openSetting({ withSubscriptions: true }) }
</script>

<template>
  <view class="discovery-page subscription-page">
    <text class="page-heading">消息提醒</text>
    <text class="page-subtitle">新活动和后续提醒，可通过微信接收。</text>
    <view v-if="!authenticated" class="info-card subscription-intro">
      <text class="card-title">登录后选择需要的提醒</text>
      <text class="body-secondary">不用报名，也不用填写姓名。</text>
      <button class="button-primary action-gap" @tap="login">登录后订阅</button>
    </view>
    <template v-else>
      <DiscoveryState :state="state" :message="error" empty-title="暂时没有可订阅的提醒" @retry="load" />
      <view v-if="state === 'ready'" class="info-card subscription-options">
        <text class="card-title">选择提醒内容</text>
        <text class="body-secondary">一次最多选3类；已订阅的提醒无需重复选择。</text>
        <view v-for="item in templates" :key="item.id" class="subscription-option">
          <view class="subscription-select" role="checkbox" :aria-checked="item.subscription?.status !== 'active' && selectedIds.includes(item.id)" :aria-disabled="busy || !item.enabled || item.subscription?.status === 'active' || pendingChoices.length > 0" @tap="item.enabled && toggle(item.id)">
            <checkbox color="#08776A" :checked="item.subscription?.status !== 'active' && selectedIds.includes(item.id)" :disabled="busy || !item.enabled || item.subscription?.status === 'active' || pendingChoices.length > 0" @tap.stop="item.enabled && toggle(item.id)" />
            <view class="subscription-copy">
              <text class="subscription-name">{{ item.title }}</text>
              <text class="body-secondary">{{ item.enabled ? (item.subscription ? statusLabels[item.subscription.status] : '未订阅') : '暂未开放' }}</text>
            </view>
          </view>
          <button v-if="item.subscription?.status === 'active'" class="subscription-stop" :disabled="busy || pendingChoices.length > 0" @tap="withdraw(item)">停止接收</button>
        </view>
        <text v-if="message" class="subscription-message" role="status">{{ message }}</text>
        <text v-if="error" class="subscription-error" role="alert">{{ error }}</text>
        <button class="button-primary action-gap" :disabled="busy || (selected.length === 0 && pendingChoices.length === 0)" @tap="subscribe">{{ busy ? '正在处理…' : pendingChoices.length > 0 ? '重试保存订阅' : '订阅所选消息' }}</button>
        <text class="subscription-help">每类提醒同意后可接收一条消息；消息发送后可再次订阅。</text>
      </view>
      <button class="button-secondary action-gap" @tap="settings">微信通知设置</button>
    </template>
  </view>
</template>

<style>
@import "../../styles/discovery.css";
.subscription-page { max-width: 760px; margin: 0 auto; }
.subscription-intro .card-title, .subscription-options > .card-title { margin-top: 0; }
.subscription-option { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-4) 0; border-bottom: 1px solid var(--border-subtle); }
.subscription-option:first-of-type { margin-top: var(--space-2); }
.subscription-select { display: flex; align-items: center; flex: 1; min-width: 0; min-height: var(--size-touch-target); gap: var(--space-2); }
.subscription-copy { flex: 1; min-width: 0; }
.subscription-name { display: block; color: var(--text-primary); font-size: var(--font-body); font-weight: 600; overflow-wrap: anywhere; }
.subscription-stop { flex: 0 0 auto; padding: 0 var(--space-2); margin: 0; min-height: var(--size-touch-target); line-height: var(--size-touch-target); background: var(--surface-secondary); color: var(--text-secondary); font-size: var(--font-body-sm); }
.subscription-stop::after { border: 0; }
.subscription-stop:active { transform: scale(0.98); }
.subscription-help { display: block; margin-top: var(--space-3); font-size: var(--font-body-sm); line-height: 1.6; color: var(--text-secondary); }
.subscription-message, .subscription-error { display: block; margin-top: var(--space-3); font-size: var(--font-body-sm); line-height: 1.6; }
.subscription-message { color: var(--status-success); }
.subscription-error { color: var(--status-error); }
</style>
