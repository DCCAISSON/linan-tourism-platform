<script setup lang="ts">
import { ref } from "vue"
import { onHide, onLoad, onShareAppMessage, onShow, onUnload } from "@dcloudio/uni-app"
import ProfileLoginSheet from "../../components/ProfileLoginSheet.vue"
import { createNotificationApi, type FamilyNotificationEntry, type RecipientInvitation, type RecipientTripSummary } from "../../notification-api"
import { getWechatSessionPhoneVerified, getWechatSessionToken } from "../../wechat-token"
import { readableError } from "../index/page-helpers"
import { createMiniappApi, type OrderHistoryItem } from "../../api"

const orderId = ref("")
const authorizationId = ref("")
const entries = ref<readonly FamilyNotificationEntry[]>([])
const invitations = ref<readonly RecipientInvitation[]>([])
const received = ref<readonly RecipientTripSummary[]>([])
const orders = ref<readonly OrderHistoryItem[]>([])
const date = ref("")
const time = ref("")
const token = ref("")
const shareExpiresAt = ref("")
const loading = ref(false)
const busy = ref(false)
const error = ref("")
const message = ref("")
const loginOpen = ref(false)
const loggedIn = ref(getWechatSessionPhoneVerified())
const articleMode = ref(false)
const articleUrl = ref("")
let generation = 0
const labels = { unclaimed: "待领取", pending: "待您确认", active: "已授权", expired: "已过期", revoked: "已撤回" } as const

onLoad(query => { orderId.value = query?.["orderId"] ?? ""; authorizationId.value = query?.["authorizationId"] ?? ""; articleMode.value = query?.["kind"] === "official_account" })
onShow(() => { loggedIn.value = getWechatSessionPhoneVerified(); void load() })
onHide(clearVisible)
onUnload(clearVisible)
onShareAppMessage(() => token.value && new Date(shareExpiresAt.value).getTime() > Date.now()
  ? { title: "邀请你接收本次行程提醒", path: `/pages/recipient-invite/index?token=${encodeURIComponent(token.value)}` }
  : { title: "临安旅游通", path: "/pages/index/index" })

function clearVisible(): void { generation += 1; articleUrl.value = ""; entries.value = []; invitations.value = []; received.value = []; orders.value = [] }
async function load(): Promise<void> {
  if (!loggedIn.value) return
  const current = ++generation
  const sessionToken = getWechatSessionToken()
  loading.value = true; error.value = ""; articleUrl.value = ""
  try {
    const api = createNotificationApi()
    if (orderId.value) {
      const [channels, invites] = await Promise.all([api.getContactChannels(orderId.value), articleMode.value ? Promise.resolve([]) : api.getInvitations(orderId.value)])
      if (current !== generation || sessionToken !== getWechatSessionToken()) return
      entries.value = channels; invitations.value = invites
    } else if (authorizationId.value) {
      const detail = await api.getRecipientTrip(authorizationId.value)
      if (current !== generation || sessionToken !== getWechatSessionToken()) return
      entries.value = detail.entries
    } else {
      const [trips, ownOrders] = await Promise.all([api.getReceivedTrips(), createMiniappApi().listOrders()])
      if (current !== generation || sessionToken !== getWechatSessionToken()) return
      received.value = trips
      orders.value = ownOrders.filter(order => order.status === "paid" && order.paidFen > 0)
    }
    if (articleMode.value) {
      const article = entries.value.find(entry => entry.kind === "official_account")
      if (article === undefined) throw new Error("公众号入口暂未开放，请联系工作人员。")
      articleUrl.value = article.url
    }
  } catch (cause) { if (current === generation) error.value = readableError(cause, "行程联系暂时无法加载，请稍后重试。") }
  finally { if (current === generation) loading.value = false }
}
function loginCompleted(): void { loginOpen.value = false; loggedIn.value = getWechatSessionPhoneVerified(); void load() }
async function createInvitation(): Promise<void> {
  if (busy.value) return
  if (!date.value || !time.value) { error.value = "请选择授权截止日期和时间。"; return }
  const deadline = new Date(`${date.value}T${time.value}:00+08:00`)
  if (!Number.isFinite(deadline.getTime()) || deadline.getTime() <= Date.now()) { error.value = "授权截止时间需要晚于现在。"; return }
  busy.value = true; error.value = ""; message.value = ""
  try {
    const invite = await createNotificationApi().createInvitation(orderId.value, deadline.toISOString())
    token.value = invite.token; shareExpiresAt.value = invite.expiresAt
    message.value = "邀请已生成，请发给实际出行人。对方领取后，您需要在此确认。"
    await load()
  } catch (cause) { error.value = readableError(cause, "邀请未能生成，请重试。") }
  finally { busy.value = false }
}
async function changeInvitation(invite: RecipientInvitation, action: "confirm" | "revoke"): Promise<void> {
  if (busy.value) return
  const result = await new Promise<UniApp.ShowModalRes>(resolve => uni.showModal({ title: action === "confirm" ? "确认出行人" : "撤回授权", content: action === "confirm" ? `确认“${invite.receiverName ?? "该联系人"}”是本单实际出行人，并允许其查看必要行前信息？` : "撤回后，该联系人立即无法查看行前信息或接收后续提醒。", success: resolve }))
  if (!result.confirm) return
  busy.value = true; error.value = ""
  try {
    const api = createNotificationApi()
    if (action === "confirm") await api.confirmInvitation(orderId.value, invite.id)
    else { await api.revokeInvitation(orderId.value, invite.id); token.value = "" }
    await load()
  } catch (cause) { error.value = readableError(cause, "操作未完成，请重试。") }
  finally { busy.value = false }
}
function openChannel(entry: FamilyNotificationEntry): void {
  error.value = ""
  if (entry.kind === "official_account") {
    const context = orderId.value ? `orderId=${encodeURIComponent(orderId.value)}` : `authorizationId=${encodeURIComponent(authorizationId.value)}`
    uni.navigateTo({ url: `/pages/trip-contact/index?${context}&kind=official_account` }); return
  }
  if (entry.kind !== "enterprise_wechat" || !entry.corpId || typeof uni.openCustomerServiceChat !== "function") { error.value = "请在支持微信客服的小程序中打开。"; return }
  uni.openCustomerServiceChat({ corpId: entry.corpId, extInfo: { url: entry.url }, showMessageCard: false, fail: () => { error.value = "微信客服暂时无法打开，请稍后重试或联系行前联系人。" } })
}
function openReceived(id: string): void { uni.navigateTo({ url: `/pages/recipient-invite/index?authorizationId=${encodeURIComponent(id)}` }) }
function openOrder(id: string): void { uni.navigateTo({ url: `/pages/trip-contact/index?orderId=${encodeURIComponent(id)}` }) }
function allOrders(): void { uni.switchTab({ url: "/pages/orders/index" }) }
function chooseDate(event: { detail: { value: string } }): void { date.value = event.detail.value }
function chooseTime(event: { detail: { value: string } }): void { time.value = event.detail.value }
function formatDate(value: string): string { return new Date(value).toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" }) }
function articleError(): void { articleUrl.value = ""; error.value = "公众号页面暂时无法打开，请返回后重试或联系工作人员。" }
</script>

<template>
  <web-view v-if="articleMode && articleUrl" :src="articleUrl" @error="articleError" />
  <view v-else class="discovery-page trip-contact-page">
    <text class="page-heading">行程管家与公众号</text>
    <view v-if="!loggedIn" class="info-card"><text class="body-secondary">登录后可查看本次行程的联系入口和出行人授权。</text><button class="button-primary action-gap" @tap="loginOpen = true">使用本人手机号登录</button></view>
    <text v-else-if="loading" class="body-secondary">正在读取行程…</text>
    <template v-else>
      <text v-if="error" class="trip-error" role="alert">{{ error }}</text>
      <button v-if="error" class="button-secondary action-gap" @tap="load">重新读取</button>
      <view v-if="(orderId || authorizationId) && !articleMode" class="info-card">
        <text class="card-title">联系行程服务</text>
        <button v-for="entry in entries" :key="entry.kind" class="button-secondary action-gap" @tap="openChannel(entry)">{{ entry.kind === 'enterprise_wechat' ? '微信客服' : '查看公众号' }}</button>
        <text v-if="entries.length === 0 && !error" class="body-secondary">线上联系入口暂未开放，可使用行前页公布的联系方式。</text>
      </view>
      <view v-if="orderId && !articleMode" class="info-card">
        <text class="card-title">邀请实际出行人接收提醒</text>
        <text class="body-secondary">对方使用自己的微信手机号领取，您确认后可查看本次行前安排。双方均可随时撤回。</text>
        <text class="trip-label">授权截止时间（北京时间）</text>
        <picker mode="date" :value="date" @change="chooseDate"><view class="trip-input">{{ date || '选择截止日期' }}</view></picker>
        <picker mode="time" :value="time" @change="chooseTime"><view class="trip-input">{{ time || '选择截止时间' }}</view></picker>
        <button class="button-primary action-gap" :disabled="busy" @tap="createInvitation">{{ busy ? '正在处理…' : '生成邀请' }}</button>
        <text v-if="message" class="trip-message" role="status">{{ message }}</text>
        <button v-if="token" class="button-secondary action-gap" open-type="share">发给出行人</button>
        <text v-if="token" class="body-secondary">邀请30分钟内可领取，过期后可重新生成；授权截止时间由您指定。</text>
      </view>
      <view v-if="orderId && !articleMode" class="info-card">
        <text class="card-title">出行人授权</text>
        <text v-if="invitations.length === 0" class="body-secondary">尚未邀请其他出行人。</text>
        <view v-for="invite in invitations" :key="invite.id" class="trip-row">
          <text class="trip-name">{{ invite.receiverName || '待领取邀请' }} · {{ labels[invite.status] }}</text>
          <text class="body-secondary">授权截至 {{ formatDate(invite.authorizationDeadline) }}</text>
          <button v-if="invite.status === 'pending'" class="button-primary action-gap" :disabled="busy" @tap="changeInvitation(invite, 'confirm')">确认是本单出行人</button>
          <button v-if="['unclaimed', 'pending', 'active'].includes(invite.status)" class="button-secondary action-gap" :disabled="busy" @tap="changeInvitation(invite, 'revoke')">撤回邀请或授权</button>
        </view>
      </view>
      <view v-if="!orderId && !authorizationId" class="info-card">
        <text class="card-title">选择我的行程</text>
        <text v-if="orders.length === 0 && !error" class="body-secondary">暂无已付款行程，可在订单中查看报名进度。</text>
        <button v-for="order in orders" :key="order.id" class="button-secondary action-gap" @tap="openOrder(order.id)">{{ order.activityTitle }} · {{ order.startsAt.slice(0, 10) }}</button>
        <button class="button-secondary action-gap" @tap="allOrders">查看全部订单</button>
      </view>
      <view v-if="!orderId && !authorizationId" class="info-card">
        <text class="card-title">我受邀的行程</text>
        <text v-if="received.length === 0 && !error" class="body-secondary">暂无受邀行程。收到付款人的邀请后，可用本人微信领取。</text>
        <button v-for="item in received" :key="item.authorizationId" class="button-secondary action-gap" @tap="openReceived(item.authorizationId)">{{ item.receiverName }} · {{ labels[item.status] }}</button>
      </view>
    </template>
    <ProfileLoginSheet v-if="loginOpen" title="登录后查看行程" @completed="loginCompleted" @cancelled="loginOpen = false" />
  </view>
</template>

<style>
@import "../../styles/discovery.css";
.trip-contact-page { max-width: var(--sheet-max-width); margin: 0 auto; }
.trip-contact-page .card-title { margin-top: 0; }
.trip-label, .trip-name { display: block; margin-top: var(--space-3); font-size: var(--font-body); color: var(--text-primary); }
.trip-input { min-height: var(--size-touch-target); padding: var(--space-2) var(--space-3); margin-top: var(--space-2); box-sizing: border-box; border: 1px solid var(--border-default); border-radius: var(--radius-control); background: var(--surface-elevated); color: var(--text-primary); }
.trip-row { padding: var(--space-3) 0; border-bottom: 1px solid var(--border-subtle); }
.trip-error, .trip-message { display: block; margin: var(--space-3) 0; line-height: 1.6; font-size: var(--font-body-sm); overflow-wrap: anywhere; }
.trip-error { color: var(--status-error); }
.trip-message { color: var(--status-success); }
</style>
