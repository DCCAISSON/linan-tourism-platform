<script setup lang="ts">
import { computed, nextTick, ref } from "vue"
import { onLoad } from "@dcloudio/uni-app"
import { createMiniappApi, type OrderDetail } from "../../api"
import { activeRefundApplicationLineIds, createRefundApplicationClient, type RefundApplication } from "../../refund-applications-api"
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

const activeApplicationLineIds = computed(() => activeRefundApplicationLineIds(applications.value))
const refundableParticipants = computed(() => order.value?.status === "paid"
  ? order.value.participants.filter((person) =>
      (person.refundStatus === "none" || person.refundStatus === "failed")
      && person.amountFen > person.refundedFen
      && !activeApplicationLineIds.value.has(person.id),
    )
  : [])
const selectedAmountFen = computed(() => refundableParticipants.value.filter((person) => selectedLineIds.value.includes(person.id)).reduce((total, person) => total + person.amountFen - person.refundedFen, 0))
const canSubmit = computed(() => selectedLineIds.value.length > 0 && reason.value.trim().length > 0 && !submitting.value)

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
    uni.showModal({
      title: "退款申请已提交",
      content: "申请正在等待工作人员审核，请耐心等待。审核通过并完成退款后，款项将原路退回。您可在本页查看申请进度。",
      showCancel: false,
      confirmText: "我知道了",
    })
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
  <view class="discovery-page refund-page" :class="{ 'refund-page--with-action': state === 'ready' && refundableParticipants.length > 0 }">
    <text class="page-heading">退款申请</text>
    <DiscoveryState :state="state" :message="error" @retry="load" />
    <view v-if="state === 'ready' && order">
      <view class="info-card refund-summary">
        <text class="card-title">{{ order.activityTitle }}</text>
        <text class="detail-line">订单号：{{ order.code }}</text>
        <text class="detail-line">先选择需要退款的参加人，再填写退款原因。</text>
        <text class="test-notice">提交后，工作人员将审核申请并按报名记录核算退款金额。</text>
      </view>
      <view class="row-between refund-section-heading">
        <text class="section-heading">选择退款人员</text>
        <text class="selection-count">已选 {{ selectedLineIds.length }} 人</text>
      </view>
      <view
        v-for="person in refundableParticipants"
        :key="person.id"
        class="info-card refund-person"
        :class="{ 'refund-person--selected': selectedLineIds.includes(person.id) }"
        role="checkbox"
        :aria-checked="selectedLineIds.includes(person.id)"
        @tap="toggleLine(person.id)"
      >
        <view class="refund-person__row">
          <checkbox class="refund-person__checkbox" color="#08776A" :checked="selectedLineIds.includes(person.id)" @tap.stop="toggleLine(person.id)" />
          <view class="refund-person__content">
            <text class="card-title refund-person__name">{{ person.displayName }}</text>
            <text class="detail-line refund-person__amount">可申请金额 {{ formatFen(person.amountFen - person.refundedFen) }}</text>
          </view>
          <text class="refund-person__status">{{ selectedLineIds.includes(person.id) ? '已选' : '选择' }}</text>
        </view>
      </view>
      <view v-if="refundableParticipants.length === 0" class="info-card">
        <text class="card-title">当前没有可申请退款的参加人</text>
        <text class="body-secondary">待支付订单需先完成付款；已提交或已退款的人员不能重复申请。</text>
      </view>
      <view v-if="refundableParticipants.length > 0" class="info-card refund-reason-card">
        <text class="card-title">申请原因</text>
        <textarea v-model="reason" class="refund-textarea" maxlength="255" placeholder="请填写退款原因（必填）" />
        <text class="refund-reason-help">请简要说明无法参加的原因，便于工作人员核对。</text>
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
    <view v-if="state === 'ready' && refundableParticipants.length > 0" class="refund-action-bar">
      <view class="refund-action-bar__summary">
        <text class="refund-action-bar__label">已选 {{ selectedLineIds.length }} 人</text>
        <text class="refund-action-bar__amount">{{ formatFen(selectedAmountFen) }}</text>
      </view>
      <button class="button-primary refund-action-bar__button" :disabled="!canSubmit" @tap="submit">
        {{ submitting ? '提交中' : '提交退款申请' }}
      </button>
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
.refund-page--with-action { padding-bottom: calc(104px + env(safe-area-inset-bottom)); }
.refund-section-heading { margin-top: var(--space-6); align-items: flex-end; }
.refund-section-heading .section-heading { margin: 0; }
.selection-count { color: var(--accent-primary); font-size: var(--font-body-sm); font-weight: 600; line-height: 1.5; }
.refund-person { border: 1px solid transparent; }
.refund-person--selected { border-color: var(--accent-primary); background: var(--accent-soft); }
.refund-person__row { display: flex; align-items: center; gap: var(--space-3); min-height: var(--size-touch-target); }
.refund-person__checkbox { flex: 0 0 auto; transform: scale(0.9); }
.refund-person__content { flex: 1; min-width: 0; }
.refund-person__name { margin-top: 0; }
.refund-person__amount { margin-top: var(--space-1); color: var(--text-secondary); }
.refund-person__status { flex: 0 0 auto; color: var(--accent-primary); font-size: var(--font-body-sm); font-weight: 600; }
.refund-reason-card { overflow: visible; }
.refund-reason-help { display: block; margin-top: var(--space-2); color: var(--text-secondary); font-size: var(--font-caption); line-height: 1.5; }
.refund-action-bar { position: fixed; z-index: var(--layer-sticky); right: 0; bottom: 0; left: 0; display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom)); border-top: 1px solid var(--border-subtle); background: var(--surface-elevated); }
.refund-action-bar__summary { flex: 0 0 auto; min-width: 92px; }
.refund-action-bar__label { display: block; color: var(--text-secondary); font-size: var(--font-caption); line-height: 1.4; }
.refund-action-bar__amount { display: block; margin-top: var(--space-1); color: var(--accent-warm); font-size: var(--font-body); font-weight: 700; line-height: 1.4; font-variant-numeric: tabular-nums; }
.refund-action-bar__button { flex: 1; min-width: 0; }
</style>
