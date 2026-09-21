<script setup lang="ts">
import { ref } from "vue"
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
onLoad((query) => { orderId.value = query?.["orderId"] ?? ""; void load() })
async function load(): Promise<void> {
  state.value = "loading"; error.value = ""
  try { order.value = await api.getOrderDetail(orderId.value); state.value = "ready" }
  catch (cause) { state.value = "error"; error.value = readableError(cause, "订单详情加载失败，请重试") }
}
async function pay(): Promise<void> {
  if (paying.value || order.value?.status !== "pending_payment") return
  paying.value = true; error.value = ""
  try { await api.createMockPayment(orderId.value); await load() }
  catch (cause) { error.value = readableError(cause, "模拟支付发起失败，请重试") }
  finally { paying.value = false }
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
        <view class="row-between"><text class="caption">{{ order.code }}</text><text class="badge">{{ orderStatusLabel(order) }}</text></view>
        <text class="card-title">{{ order.activityTitle }}</text>
        <text class="detail-line">{{ order.schoolName }} · {{ formatDateLabel(order.startsAt) }} 至 {{ formatDateLabel(order.endsAt) }}</text>
        <text class="detail-line">付款人：{{ order.payerName }}</text><text class="detail-line">联系称呼：{{ order.contactName }}</text>
        <text class="detail-line">紧急联系人：{{ order.emergencyContactName ?? '未提供' }}</text><text class="detail-line">紧急联系电话：{{ order.emergencyContactPhone ?? '未提供' }}</text>
        <text class="detail-line">应付金额：{{ formatFen(order.amountFen) }}</text><text class="detail-line">已付金额：{{ formatFen(order.paidFen) }}</text>
      </view>
      <text class="section-heading">参加人员（{{ order.participantCount }} 人）</text>
      <view v-for="person in order.participants" :key="person.id" class="info-card participant-snapshot"><text class="card-title">{{ person.displayName }}</text><text class="body-secondary">{{ participantPlacement(person) }}</text><text class="detail-line">报名金额：{{ formatFen(person.amountFen) }}</text></view>
      <text class="test-notice">人员和金额按报名时的记录展示。本地模拟支付不产生真实扣款。</text>
      <text v-if="error" class="test-notice">{{ error }}</text>
      <button v-if="order.status === 'pending_payment'" class="button-primary action-gap" :disabled="paying" @tap="pay">{{ paying ? '模拟支付发起中' : '发起本地模拟支付' }}</button>
      <button class="button-secondary action-gap" @tap="load">刷新订单状态</button>
    </view>
  </view>
</template>

<style>
@import "../../styles/discovery.css";
</style>
