<script setup lang="ts">
import { computed, nextTick, ref } from "vue"
import { onLoad } from "@dcloudio/uni-app"
import { createMiniappApi, type OrderDetail } from "../../api"
import { createRefundApplicationClient, type RefundApplication } from "../../refund-applications-api"
import DiscoveryState from "../../components/DiscoveryState.vue"
import { formatFen, type LoadState } from "../../enrollment-flow"
import { readableError } from "../index/page-helpers"

const ordersApi = createMiniappApi()
const refundsApi = createRefundApplicationClient()
const orderId = ref("")
const order = ref<OrderDetail | null>(null)
const applications = ref<readonly RefundApplication[]>([])
const selectedLineIds = ref<readonly string[]>([])
const reason = ref("")
const state = ref<LoadState>("loading")
const error = ref("")
const submitting = ref(false)
const statusLabels = { submitted: "待审核", approved: "已批准", rejected: "已拒绝", cancelled: "已撤回" } as const

const refundableParticipants = computed(() => (order.value?.participants ?? []).filter((person) => person.refundStatus === "none" || person.refundStatus === "failed"))
const selectedAmountFen = computed(() => refundableParticipants.value.filter((person) => selectedLineIds.value.includes(person.id)).reduce((total, person) => total + person.amountFen - person.refundedFen, 0))

onLoad((query) => { orderId.value = query?.["orderId"] ?? ""; void load() })

async function load(): Promise<void> {
  state.value = "loading"
  error.value = ""
  await nextTick()
  uni.pageScrollTo({ scrollTop: 0, duration: 0 })
  try {
    const [detail, history] = await Promise.all([ordersApi.getOrderDetail(orderId.value), refundsApi.listRefundApplications(orderId.value)])
    order.value = detail
    applications.value = history
    selectedLineIds.value = []
    state.value = "ready"
  } catch (cause) {
    state.value = "error"
    error.value = readableError(cause, "退款申请加载失败，请重试")
  }
}

function toggleLine(lineId: string): void {
  selectedLineIds.value = selectedLineIds.value.includes(lineId)
    ? selectedLineIds.value.filter((id) => id !== lineId)
    : [...selectedLineIds.value, lineId]
}

async function submit(): Promise<void> {
  if (submitting.value || selectedLineIds.value.length === 0) return
  submitting.value = true
  error.value = ""
  try {
    await refundsApi.submitRefundApplication(orderId.value, {
      lineIds: selectedLineIds.value,
      reason: reason.value,
      idempotencyKey: `family-refund:${orderId.value}:${selectedLineIds.value.join(",")}:${Date.now()}`,
    })
    reason.value = ""
    await load()
  } catch (cause) {
    error.value = readableError(cause, "退款申请提交失败")
  } finally {
    submitting.value = false
  }
}

async function cancelApplication(applicationId: string): Promise<void> {
  if (submitting.value) return
  submitting.value = true
  try {
    await refundsApi.cancelRefundApplication(orderId.value, applicationId)
    await load()
  } catch (cause) {
    error.value = readableError(cause, "撤回失败")
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <view class="discovery-page">
    <text class="page-heading">退款申请</text>
    <DiscoveryState :state="state" :message="error" @retry="load" />
    <view v-if="state === 'ready' && order">
      <view class="info-card refund-summary">
        <text class="card-title">{{ order.activityTitle }}</text>
        <text class="detail-line">订单号：{{ order.code }}</text>
        <text class="detail-line">申请金额由服务器按报名时人员金额重新计算。</text>
        <text class="test-notice">提交申请不会取消名单，也不表示微信退款到账。</text>
      </view>
      <text class="section-heading">选择申请退款人员</text>
      <view v-for="person in refundableParticipants" :key="person.id" class="info-card participant-snapshot" @tap="toggleLine(person.id)">
        <view class="row-between">
          <text class="card-title">{{ person.displayName }}</text>
          <text class="badge">{{ selectedLineIds.includes(person.id) ? '已选择' : '可申请' }}</text>
        </view>
        <text class="detail-line">可申请金额：{{ formatFen(person.amountFen - person.refundedFen) }}</text>
      </view>
      <view class="info-card">
        <text class="card-title">申请原因</text>
        <textarea v-model="reason" class="refund-textarea" maxlength="255" placeholder="请填写退款原因" />
        <text class="detail-line">当前选择金额：{{ formatFen(selectedAmountFen) }}</text>
        <button class="button-primary action-gap" :disabled="submitting || selectedLineIds.length === 0 || reason.trim().length === 0" @tap="submit">
          {{ submitting ? '提交中' : '提交退款申请' }}
        </button>
      </view>
      <text class="section-heading">申请记录</text>
      <view v-if="applications.length === 0" class="info-card">
        <text class="body-secondary">暂无退款申请</text>
      </view>
      <view v-for="item in applications" :key="item.id" class="info-card refund-history">
        <view class="row-between">
          <text class="card-title">{{ statusLabels[item.status] }}</text>
          <text class="badge">{{ formatFen(item.amountFen) }}</text>
        </view>
        <text class="detail-line">原因：{{ item.reason }}</text>
        <text v-if="item.reviewReason" class="detail-line">审核意见：{{ item.reviewReason }}</text>
        <text v-for="line in item.lines" :key="line.lineId" class="detail-line">{{ line.displayName }}：{{ formatFen(line.amountFen) }}</text>
        <button v-if="item.status === 'submitted'" class="button-secondary action-gap" :disabled="submitting" @tap="cancelApplication(item.id)">撤回申请</button>
      </view>
    </view>
  </view>
</template>

<style>
@import "../../styles/discovery.css";
.refund-textarea {
  width: 100%;
  min-height: 120px;
  padding: 12px;
  box-sizing: border-box;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--surface-primary);
  color: var(--text-primary);
  font-size: 16px;
  line-height: 1.5;
}
</style>
