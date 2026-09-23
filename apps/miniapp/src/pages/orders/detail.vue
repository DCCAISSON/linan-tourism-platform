<script setup lang="ts">
import { computed, nextTick, ref } from "vue"
import { onLoad } from "@dcloudio/uni-app"
import { createMiniappApi, type OrderDetail, type OrderParticipant } from "../../api"
import DiscoveryState from "../../components/DiscoveryState.vue"
import { formatDateLabel, formatFen, type LoadState } from "../../enrollment-flow"
import { orderStatusLabel } from "../../checkout-flow"
import { readableError } from "../index/page-helpers"
const api = createMiniappApi()
const orderId = ref("")
const order = ref<OrderDetail | null>(null)
const state = ref<LoadState>("loading")
const error = ref("")
const paying = ref(false)
const wechatPayEnabled = import.meta.env["VITE_WECHAT_PAY_ENABLED"] === "true"
const productionBuild = import.meta.env["PROD"] === true
const paymentButtonText = computed(() => {
  if (paying.value) return wechatPayEnabled ? "微信支付发起中" : "本地模拟支付发起中"
  if (wechatPayEnabled) return "发起微信支付"
  return productionBuild ? "微信支付未启用" : "发起本地模拟支付"
})
const paymentActionDisabled = computed(() => paying.value || (!wechatPayEnabled && productionBuild))
const paymentModeNotice = computed(() => {
  if (wechatPayEnabled) return "当前订单将通过微信支付发起付款，请按微信收银台结果确认订单状态。"
  if (productionBuild) return "微信支付未启用，生产环境不会发起本地模拟支付，请联系工作人员处理。"
  return "当前为本地开发模拟支付，不产生真实扣款。"
})
const refundSummaryLabels = { none: "尚无成功退款", partial: "部分退款", full: "全部退款" } as const satisfies Record<OrderDetail["refundSummary"]["status"], string>
const participantRefundLabels = { none: "未退款", pending: "退款处理中（本地测试）", refunded: "已退款（本地测试）", failed: "退款处理失败（本地测试）" } as const satisfies Record<OrderParticipant["refundStatus"], string>
const refundHistoryLabels = { pending: "处理中（本地测试）", succeeded: "处理成功（本地测试）", failed: "处理失败（本地测试）" } as const satisfies Record<OrderDetail["refundHistory"][number]["status"], string>
onLoad((query) => { orderId.value = query?.["orderId"] ?? ""; void load() })
async function load(): Promise<void> {
  state.value = "loading"; error.value = ""
  await nextTick()
  uni.pageScrollTo({ scrollTop: 0, duration: 0 })
  try { order.value = await api.getOrderDetail(orderId.value); state.value = "ready" }
  catch (cause) { state.value = "error"; error.value = readableError(cause, "订单详情加载失败，请重试") }
}
async function pay(): Promise<void> {
  if (paying.value || order.value?.status !== "pending_payment") return
  paying.value = true; error.value = ""
  try {
    if (wechatPayEnabled) {
      const code = await loginForWechatPayment()
      const payment = await api.createWechatPayment(orderId.value, code)
      await requestWechatPayment(payment.miniappPayment)
    } else {
      if (productionBuild) throw new Error("微信支付未启用")
      await api.createMockPayment(orderId.value)
    }
    await load()
  }
  catch (cause) { error.value = readableError(cause, "支付发起失败，请重试") }
  finally { paying.value = false }
}
async function loginForWechatPayment(): Promise<string> {
  return await new Promise((resolve, reject) => {
    uni.login({ provider: "weixin", success: (result) => {
      if (typeof result.code === "string" && result.code.length > 0) resolve(result.code)
      else reject(new Error("微信登录未返回 code"))
    }, fail: reject })
  })
}

async function requestWechatPayment(payment: { readonly timeStamp: string; readonly nonceStr: string; readonly package: string; readonly signType: "RSA"; readonly paySign: string }): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    uni.requestPayment({ provider: "wxpay", ...payment, success: () => resolve(), fail: reject })
  })
}

function openAlbum(): void {
  if (order.value === null) return
  uni.navigateTo({ url: `/pages/album/index?orderId=${encodeURIComponent(order.value.id)}` })
}

function openFeedback(): void {
  if (order.value === null) return
  uni.navigateTo({ url: `/pages/feedback/index?tourSessionId=${encodeURIComponent(order.value.tourSessionId)}&orderId=${encodeURIComponent(order.value.id)}` })
}

function openHealth(): void {
  if (order.value === null) return
  uni.navigateTo({ url: `/pages/health/index?orderId=${encodeURIComponent(order.value.id)}` })
}

function openPretrip(): void {
  if (order.value === null) return
  uni.navigateTo({ url: `/pages/orders/pretrip?orderId=${encodeURIComponent(order.value.id)}` })
}

function openNotifications(): void {
  if (order.value === null) return
  uni.navigateTo({ url: `/pages/notifications/index?orderId=${encodeURIComponent(order.value.id)}` })
}

function participantPlacement(person: OrderParticipant): string {
  if (person.participantKind === "adult") {
    return "成人 · 无需年级班级"
  }
  return `${person.gradeName ?? "年级未记录"} · ${person.className ?? "班级未记录"}`
}
</script>

<template>
  <view class="discovery-page">
    <text class="page-heading">订单详情</text>
    <DiscoveryState :state="state" :message="error" @retry="load" />
    <view v-if="state === 'ready' && order">
      <view class="info-card">
        <view class="row-between order-overview"><text class="caption">{{ order.code }}</text><text class="badge order-status">{{ orderStatusLabel(order) }}{{ order.refundSummary.status === 'partial' ? ' · 部分退款（本地测试）' : order.refundSummary.status === 'full' ? '（本地测试）' : '' }}</text></view>
        <text class="card-title order-title">{{ order.activityTitle }}</text>
        <text class="detail-line">{{ order.schoolName }} · {{ formatDateLabel(order.startsAt) }} 至 {{ formatDateLabel(order.endsAt) }}</text>
        <text class="detail-line">付款人：{{ order.payerName }}</text><text class="detail-line">联系称呼：{{ order.contactName }}</text>
        <text class="detail-line">紧急联系人：{{ order.emergencyContactName ?? '未提供' }}</text><text class="detail-line">紧急联系电话：{{ order.emergencyContactPhone ?? '未提供' }}</text>
        <text class="detail-line">应付金额：{{ formatFen(order.amountFen) }}</text><text class="detail-line">已付金额：{{ formatFen(order.paidFen) }}</text>
      </view>
      <view class="info-card refund-summary">
        <text class="card-title">退款记录（本地测试）</text>
        <text class="detail-line">{{ refundSummaryLabels[order.refundSummary.status] }}</text>
        <text class="detail-line">累计已退金额：{{ formatFen(order.refundSummary.refundedFen) }}</text>
        <text class="detail-line">处理中金额：{{ formatFen(order.refundSummary.pendingFen) }}</text>
        <text v-if="order.refundSummary.failedCount > 0" class="detail-line">处理失败：{{ order.refundSummary.failedCount }} 笔</text>
        <text v-if="order.refundHistory.length === 0" class="body-secondary">暂无退款记录</text>
        <text class="test-notice">本地业务处理，未调用微信退款，不表示资金已到账。</text>
      </view>
      <text class="section-heading">报名时参加人员（{{ order.participantCount }} 人）</text>
      <view v-for="person in order.participants" :key="person.id" class="info-card participant-snapshot">
        <text class="card-title">{{ person.displayName }}</text>
        <text class="body-secondary">{{ participantPlacement(person) }}</text>
        <text class="detail-line">报名金额：{{ formatFen(person.amountFen) }}</text>
        <text class="detail-line">退款状态：{{ participantRefundLabels[person.refundStatus] }}</text>
        <text class="detail-line">已退金额：{{ formatFen(person.refundedFen) }}</text>
      </view>
      <text v-if="order.refundHistory.length > 0" class="section-heading">退款处理历史</text>
      <view v-for="refund in order.refundHistory" :key="refund.id" class="info-card refund-history">
        <text class="card-title">{{ refundHistoryLabels[refund.status] }}</text>
        <text class="detail-line">本次金额：{{ formatFen(refund.amountFen) }}</text>
        <text v-for="line in refund.lines" :key="line.lineId" class="detail-line">{{ line.displayName }}：{{ formatFen(line.amountFen) }}</text>
        <text class="detail-line">登记日期：{{ formatDateLabel(refund.requestedAt) }}</text>
        <text v-if="refund.processedAt" class="detail-line">处理日期：{{ formatDateLabel(refund.processedAt) }}</text>
      </view>
      <text class="test-notice">人员和金额按报名时的记录展示。{{ paymentModeNotice }}</text>
      <text v-if="error" class="test-notice">{{ error }}</text>
      <button v-if="order.status === 'pending_payment'" class="button-primary action-gap" :disabled="paymentActionDisabled" @tap="pay">{{ paymentButtonText }}</button>
      <button v-if="order.status === 'paid'" class="button-secondary action-gap" @tap="openAlbum">查看活动影像</button>
      <button v-if="order.status === 'paid' || order.status === 'refunded'" class="button-secondary action-gap" @tap="openPretrip">查看行前服务</button>
      <button v-if="order.status === 'paid' || order.status === 'refunded'" class="button-secondary action-gap" @tap="openFeedback">提交服务反馈</button>
      <button v-if="order.status === 'paid' || order.status === 'refunded'" class="button-secondary action-gap" @tap="openHealth">公开摘要与健康授权</button>
      <button v-if="order.status === 'paid' || order.status === 'refunded'" class="button-secondary action-gap" @tap="openNotifications">通知授权与接收入口</button>
      <button class="button-secondary action-gap" @tap="load">刷新订单状态</button>
    </view>
  </view>
</template>

<style>
@import "../../styles/discovery.css";
.order-overview { flex-wrap: wrap; }
.order-status { max-width: 100%; white-space: normal; }
.order-title { text-wrap: balance; }
</style>
