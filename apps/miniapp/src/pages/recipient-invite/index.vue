<script setup lang="ts">
import { ref } from "vue"
import { onHide, onLoad, onShow, onUnload } from "@dcloudio/uni-app"
import ProfileLoginSheet from "../../components/ProfileLoginSheet.vue"
import TripServiceEntry from "../../components/TripServiceEntry.vue"
import { createNotificationApi, requestNotificationSubscription, type NotificationSubscribeOutcome, type RecipientTrip } from "../../notification-api"
import { getWechatSessionPhoneVerified, getWechatSessionToken } from "../../wechat-token"
import { readableError } from "../index/page-helpers"

const token = ref("")
const authorizationId = ref("")
const receiverName = ref("")
const detail = ref<RecipientTrip | null>(null)
const loggedIn = ref(getWechatSessionPhoneVerified())
const loginOpen = ref(false)
const loading = ref(false)
const busy = ref(false)
const error = ref("")
const message = ref("")
const pendingSubscription = ref<{ templateId: string; outcome: NotificationSubscribeOutcome; expectedVersion: number } | null>(null)
let generation = 0
const labels = { pending: "等待付款人确认", active: "行程授权已生效", expired: "行程授权已过期", revoked: "行程授权已撤回" } as const

onLoad(query => { token.value = query?.["token"] ?? ""; authorizationId.value = query?.["authorizationId"] ?? "" })
onShow(() => { loggedIn.value = getWechatSessionPhoneVerified(); void load() })
onHide(clearVisible)
onUnload(clearVisible)
function clearVisible(): void { generation += 1; detail.value = null }
function loginCompleted(): void { loginOpen.value = false; loggedIn.value = getWechatSessionPhoneVerified(); void load() }
async function load(): Promise<void> {
  if (!loggedIn.value || !authorizationId.value) return
  const current = ++generation
  const session = getWechatSessionToken()
  loading.value = true; error.value = ""
  try {
    const next = await createNotificationApi().getRecipientTrip(authorizationId.value)
    if (current !== generation || session !== getWechatSessionToken()) return
    detail.value = next
  } catch (cause) { if (current === generation) { detail.value = null; error.value = readableError(cause, "行程暂时无法读取，请重试。") } }
  finally { if (current === generation) loading.value = false }
}
async function claim(): Promise<void> {
  if (busy.value) return
  if (!receiverName.value.trim()) { error.value = "请填写本人姓名，方便付款人确认。"; return }
  if (!token.value) { error.value = "邀请链接无效，请向付款人重新获取。"; return }
  busy.value = true; error.value = ""
  const session = getWechatSessionToken()
  try {
    const code = await loginCode()
    if (session !== getWechatSessionToken()) throw new Error("登录身份已变化，请重新领取。")
    const id = await createNotificationApi().acceptInvitation(token.value, receiverName.value.trim(), code)
    if (session !== getWechatSessionToken()) return
    token.value = ""; authorizationId.value = id
    await load()
  } catch (cause) { error.value = readableError(cause, "邀请未能领取，请重试或向付款人重新获取。") }
  finally { busy.value = false }
}
async function subscribe(template: RecipientTrip["templates"][number]): Promise<void> {
  if (busy.value || pendingSubscription.value !== null) return
  busy.value = true; error.value = ""; message.value = ""
  const session = getWechatSessionToken()
  try {
    const outcome = await requestNotificationSubscription(template.templateId, detail.value?.templates ?? [])
    if (session !== getWechatSessionToken()) throw new Error("登录身份已变化，请重新打开行程。")
    pendingSubscription.value = { templateId: template.templateId, outcome, expectedVersion: template.version }
    await saveSubscription()
  } catch (cause) { error.value = readableError(cause, "订阅未完成，请重试。") }
  finally { busy.value = false }
}
async function saveSubscription(): Promise<void> {
  const choice = pendingSubscription.value
  if (choice === null) return
  const session = getWechatSessionToken()
  const code = await loginCode()
  if (session !== getWechatSessionToken()) { pendingSubscription.value = null; throw new Error("登录身份已变化，请重新打开行程。") }
  await createNotificationApi().subscribeRecipient(authorizationId.value, { ...choice, code })
  pendingSubscription.value = null
  message.value = choice.outcome === "accept" ? "已同意接收一次行前提醒。" : "本次未开启消息提醒，仍可在此查看行程。"
  await load()
}
async function retrySubscription(): Promise<void> {
  if (busy.value) return
  busy.value = true; error.value = ""
  try { await saveSubscription() }
  catch (cause) { error.value = readableError(cause, "订阅结果暂未保存，请重试。") }
  finally { busy.value = false }
}
async function withdraw(): Promise<void> {
  if (busy.value) return
  const result = await new Promise<UniApp.ShowModalRes>(resolve => uni.showModal({ title: "撤回行程授权", content: "撤回后将停止接收本单提醒，并无法再查看行前信息。", success: resolve }))
  if (!result.confirm) return
  busy.value = true; error.value = ""; message.value = ""
  try { await createNotificationApi().withdrawRecipient(authorizationId.value); pendingSubscription.value = null; await load() }
  catch (cause) { error.value = readableError(cause, "撤回未完成，请重试。") }
  finally { busy.value = false }
}
function loginCode(): Promise<string> { return new Promise((resolve, reject) => uni.login({ provider: "weixin", success: result => result.code ? resolve(result.code) : reject(new Error("微信登录未完成，请重试。")), fail: reject })) }
function formatDate(value: string): string { return new Date(value).toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" }) }
</script>

<template>
  <view class="discovery-page recipient-page">
    <text class="page-heading">我的出行提醒</text>
    <view v-if="!loggedIn" class="info-card"><text class="card-title">使用本人身份领取</text><text class="body-secondary">付款人邀请您查看本次行前安排。请用自己的微信手机号登录，领取后由付款人确认。</text><button class="button-primary action-gap" @tap="loginOpen = true">使用本人手机号登录</button></view>
    <template v-else>
      <text v-if="loading" class="body-secondary">正在读取行程…</text>
      <view v-else-if="!authorizationId" class="info-card">
        <text class="card-title">领取出行邀请</text><text class="body-secondary">确认后可查看本次行程的时间、集合地点及提醒，您可随时撤回。</text>
        <text class="recipient-label">本人姓名</text><input v-model="receiverName" class="recipient-input" maxlength="120" placeholder="填写实际出行人姓名" :disabled="busy" />
        <button class="button-primary action-gap" :disabled="busy || !token" @tap="claim">{{ busy ? '正在领取…' : '领取邀请' }}</button>
        <text v-if="!token" class="body-secondary">邀请链接不完整，请向付款人重新获取。</text>
      </view>
      <template v-else-if="detail">
        <view class="info-card"><text class="card-title">{{ labels[detail.status] }}</text><text v-if="detail.status === 'pending'" class="body-secondary">请告知付款人您已领取，待其确认后可查看行程并订阅提醒。</text><text v-if="detail.expiresAt" class="body-secondary">授权截至 {{ formatDate(detail.expiresAt) }}</text><button class="button-secondary action-gap" :disabled="busy" @tap="load">刷新状态</button></view>
        <view v-if="detail.trip" class="info-card">
          <text class="card-title">{{ detail.trip.title }}</text><text class="recipient-line">出行日期：{{ detail.trip.startsAt.slice(0, 10) }} 至 {{ detail.trip.endsAt.slice(0, 10) }}</text>
          <text class="recipient-line">集合时间：{{ detail.trip.gatheringAt ? formatDate(detail.trip.gatheringAt) : '待公布' }}</text><text class="recipient-line">集合地点：{{ detail.trip.gatheringPlace || '待公布' }}</text><text class="body-secondary">{{ detail.trip.notice }}</text>
          <TripServiceEntry :authorization-id="authorizationId" />
        </view>
        <view v-if="detail.status === 'active'" class="info-card">
          <text class="card-title">行前消息提醒</text><text class="body-secondary">每次同意可接收一条提醒，发送后可再次订阅。</text>
          <text v-if="detail.templates.length === 0" class="body-secondary">微信行前提醒暂未开放，您仍可在此查看安排。</text>
          <view v-for="template in detail.templates" :key="template.templateId" class="recipient-row"><text class="recipient-line">{{ template.title }}</text><button class="button-secondary action-gap" :disabled="busy || template.status === 'active' || pendingSubscription !== null" @tap="subscribe(template)">{{ template.status === 'active' ? '已订阅一次提醒' : '订阅一次提醒' }}</button></view>
          <button v-if="pendingSubscription" class="button-primary action-gap" :disabled="busy" @tap="retrySubscription">重试保存订阅结果</button>
        </view>
        <button v-if="detail.status === 'active' || detail.status === 'pending'" class="button-secondary action-gap" :disabled="busy" @tap="withdraw">撤回本单授权</button>
      </template>
      <text v-if="message" class="recipient-message" role="status">{{ message }}</text><text v-if="error" class="recipient-error" role="alert">{{ error }}</text>
      <button v-if="error && authorizationId" class="button-secondary action-gap" @tap="load">重新读取</button>
    </template>
    <ProfileLoginSheet v-if="loginOpen" title="本人微信手机号登录" @completed="loginCompleted" @cancelled="loginOpen = false" />
  </view>
</template>

<style>
@import "../../styles/discovery.css";
.recipient-page { max-width: var(--sheet-max-width); margin: 0 auto; }
.recipient-page .card-title { margin-top: 0; }
.recipient-label, .recipient-line { display: block; margin-top: var(--space-3); color: var(--text-primary); font-size: var(--font-body); line-height: 1.6; overflow-wrap: anywhere; }
.recipient-input { min-height: var(--size-touch-target); padding: var(--space-2) var(--space-3); margin-top: var(--space-2); border: 1px solid var(--border-default); border-radius: var(--radius-control); background: var(--surface-elevated); }
.recipient-row { padding: var(--space-2) 0 var(--space-3); border-bottom: 1px solid var(--border-subtle); }
.recipient-message, .recipient-error { display: block; margin-top: var(--space-3); font-size: var(--font-body-sm); line-height: 1.6; }
.recipient-message { color: var(--status-success); }
.recipient-error { color: var(--status-error); }
</style>
