<script setup lang="ts">
import { computed } from "vue"
import { formatFen } from "../../enrollment-flow"
import ConsultationEntry from "../../components/ConsultationEntry.vue"
import TripServiceEntry from "../../components/TripServiceEntry.vue"
import type { useEnrollmentPage } from "./useEnrollmentPage"

const props = defineProps<{
  readonly page: ReturnType<typeof useEnrollmentPage>
}>()

const {
  contract, contractState, contractPending, refreshContract, openContract,
  canRetryPayment,
  errorMessage,
  order,
  orderLabel,
  payment,
  paymentUnavailableNotice,
  refreshOrder,
  startPayment,
  submissionCode,
  wechatPaymentAvailable,
} = props.page
const paymentButtonVisible = computed(() => canRetryPayment.value && wechatPaymentAvailable.value)
const paymentStatusText = computed(() => {
  if (contractState.value === "loading") return "正在读取本次报名合同。"
  if (contractState.value === "error") return "合同暂未读取，请重试后继续办理。"
  if (contractPending.value) return "订单已创建，请先阅读本次合同并完成本人签字。"
  if (contract.value?.status === "parent_signed_pending_agency") return order.value?.status === "paid" ? "已支付，本人签字已保存，旅行社手续待处理。" : "本人已签字，待旅行社处理；可继续办理付款。"
  if (wechatPaymentAvailable.value) return order.value?.status === "paid" ? "支付成功，报名信息已确认。" : "订单已创建，请完成微信支付。"
  return order.value?.status === "paid" ? "订单已确认，可在我的订单查看。" : paymentUnavailableNotice
})
function openOrders(): void { uni.switchTab({ url: "/pages/orders/index" }) }
</script>

<template>
  <view class="order-panel" aria-live="polite">
    <text class="order-panel__title">{{ orderLabel }}</text>
    <text class="order-panel__body">{{ paymentStatusText }}</text>

    <view class="order-detail">
      <text class="order-detail__item">报名编号：{{ submissionCode }}</text>
      <text class="order-detail__item">订单编号：{{ order?.code ?? "待创建" }}</text>
      <text class="order-detail__item">付款人：{{ order?.payerName ?? "待确认" }}</text>
      <text class="order-detail__item">参与人数：{{ order?.participantCount ?? 0 }} 人</text>
      <text class="order-detail__item">应付金额：{{ order ? formatFen(order.amountFen) : "待确认" }}</text>
      <text class="order-detail__item">已付金额：{{ order ? formatFen(order.paidFen) : "待确认" }}</text>
      <text v-if="payment && wechatPaymentAvailable" class="order-detail__item">支付单号：{{ payment.paymentNo }}</text>
    </view>

    <view v-if="errorMessage.length > 0" class="order-panel__error">
      <text>{{ errorMessage }}</text>
    </view>

    <view class="order-actions">
      <button v-if="contractPending" class="primary-button" @tap="openContract">阅读合同并签字</button>
      <button v-else-if="contractState === 'error' || contractState === 'idle'" class="primary-button" @tap="refreshContract">重新读取合同</button>
      <button
        v-if="paymentButtonVisible"
        class="secondary-button"
        @tap="startPayment"
      >
        发起微信支付
      </button>
      <button class="primary-button" @tap="refreshOrder">刷新订单状态</button>
    </view>
    <button v-if="contract && !contractPending" class="secondary-button own-orders-entry" @tap="openContract">查看合同与签字</button>
    <button class="secondary-button own-orders-entry" @tap="openOrders">查看我的订单</button>
    <view v-if="order?.status === 'pending_payment'" class="order-consultation"><ConsultationEntry :context="{ source: 'order', id: order.id }" /></view>
    <view v-if="order?.status === 'paid'" class="order-consultation"><TripServiceEntry :order-id="order.id" /></view>
  </view>
</template>

<style scoped>
.order-panel {
  box-sizing: border-box;
  margin-top: 24px;
  padding: 20px;
  border-radius: 8px;
  background: var(--surface-elevated);
}

.order-panel__title {
  display: block;
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 600;
  line-height: 1.4;
}

.order-panel__body,
.order-detail__item,
.order-panel__error {
  display: block;
  margin-top: 8px;
  font-size: 16px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.order-panel__body {
  color: var(--text-secondary);
}

.order-detail {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
}

.order-detail__item {
  color: var(--text-primary);
}

.order-panel__error {
  box-sizing: border-box;
  min-height: 44px;
  padding: 12px;
  border: 1px solid var(--status-error);
  border-radius: 8px;
  color: var(--status-error);
  background: var(--surface-secondary);
}

.order-actions {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.primary-button,
.secondary-button {
  flex: 1 1 0;
  min-width: 0;
  min-height: 44px;
  margin: 0;
  border-radius: 8px;
  font-size: 16px;
  line-height: 44px;
}
.own-orders-entry { width: 100%; margin-top: 16px; }
.order-consultation { margin-top: var(--space-3); }
.order-consultation :deep(.button-secondary) { min-height: var(--size-touch-target); border-radius: var(--radius-control); color: var(--accent-primary); background: var(--accent-soft); font-size: var(--font-body); line-height: var(--size-touch-target); }

.primary-button {
  color: var(--surface-elevated);
  background: var(--accent-primary);
}

.secondary-button {
  color: var(--accent-primary);
  background: var(--surface-secondary);
}
</style>
