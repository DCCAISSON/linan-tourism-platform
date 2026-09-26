<script setup lang="ts">
import { computed, ref } from "vue"
import { onShow } from "@dcloudio/uni-app"
import { ApiError, createMiniappApi, type OrderHistoryItem } from "../../api"
import DiscoveryState from "../../components/DiscoveryState.vue"
import { formatDateLabel, formatFen, type LoadState } from "../../enrollment-flow"
import { orderStatusLabel } from "../../checkout-flow"
import { readableError } from "../index/page-helpers"
import { getWechatSessionToken } from "../../wechat-token"
const api = createMiniappApi()
const state = ref<LoadState>("loading")
const error = ref("")
const orders = ref<readonly OrderHistoryItem[]>([])
const selectedStatus = ref("")
const statuses = [{ value: "", label: "全部" }, { value: "pending_payment", label: "待支付" }, { value: "paid", label: "已支付" }] as const
const filtered = computed(() => orders.value.filter((order) => selectedStatus.value === "" || order.status === selectedStatus.value))
onShow(() => {
  if (import.meta.env["VITE_WECHAT_LOGIN_ENABLED"] === "true" && getWechatSessionToken() === undefined) {
    uni.navigateTo({ url: "/pages/login/index?returnTo=%2Fpages%2Forders%2Findex" })
    return
  }
  void load()
})
async function load(): Promise<void> {
  state.value = "loading"; error.value = ""
  try { orders.value = await api.listOrders(); state.value = orders.value.length > 0 ? "ready" : "empty" }
  catch (cause) {
    if (cause instanceof ApiError && cause.statusCode === 401) uni.navigateTo({ url: "/pages/login/index?returnTo=%2Fpages%2Forders%2Findex" })
    state.value = "error"; error.value = readableError(cause, "订单加载失败，请重试") }
}
function open(id: string): void { uni.navigateTo({ url: `/pages/orders/detail?orderId=${encodeURIComponent(id)}` }) }
function activities(): void { uni.switchTab({ url: "/pages/activities/index" }) }
</script>

<template>
  <view class="discovery-page">
    <text class="page-heading">我的订单</text><text class="page-subtitle">查看本家庭的报名记录、参加人员和支付状态。</text>
    <view class="status-tabs"><button v-for="status in statuses" :key="status.value" class="button-secondary" :class="{ 'status-tabs--selected': selectedStatus === status.value }" @tap="selectedStatus = status.value">{{ status.label }}</button></view>
    <DiscoveryState :state="state" :message="error" empty-title="本家庭暂无订单" @retry="load" />
    <button v-if="state === 'empty'" class="button-primary action-gap" @tap="activities">查看研学活动</button>
    <view v-if="state === 'ready'">
      <text v-if="filtered.length === 0" class="test-notice">暂无该状态的订单。</text>
      <view v-for="order in filtered" :key="order.id" class="info-card order-history-card">
        <view class="row-between"><text class="caption">{{ order.code }}</text><text class="badge">{{ orderStatusLabel(order) }}</text></view>
        <text class="card-title">{{ order.activityTitle }}</text>
        <text class="body-secondary">{{ order.schoolName }} · {{ formatDateLabel(order.startsAt) }} 至 {{ formatDateLabel(order.endsAt) }}</text>
        <text class="detail-line">参加 {{ order.participantCount }} 人 · 付款人 {{ order.payerName }}</text>
        <text class="detail-line">应付 {{ formatFen(order.amountFen) }} · 已付 {{ formatFen(order.paidFen) }}</text>
        <button class="button-secondary order-detail-entry action-gap" @tap="open(order.id)">查看订单详情</button>
      </view>
    </view>
    <text class="test-notice">订单支付以实际开通的微信支付结果为准；如暂未开放，请联系工作人员处理。</text>
  </view>
</template>

<style>
@import "../../styles/discovery.css";
.status-tabs { display: flex; gap: var(--space-2); margin-top: var(--space-4); }
.status-tabs .button-secondary { flex: 1; min-width: 0; }
.status-tabs--selected { color: var(--on-accent); background: var(--accent-primary); }
</style>
