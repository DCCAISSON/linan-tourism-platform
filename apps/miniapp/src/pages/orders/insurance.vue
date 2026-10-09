<script setup lang="ts">
import { ref } from "vue"
import { onHide, onLoad, onShow, onUnload } from "@dcloudio/uni-app"
import { ApiError } from "../../api-error"
import { createInsuranceApi, type FamilyInsuranceRecord, type FamilyInsuranceResponse, type InsurancePlan } from "../../insurance-api"
import { getEnrollmentDraftOwner, getWechatSessionToken } from "../../wechat-token"
import DiscoveryState from "../../components/DiscoveryState.vue"

const api = createInsuranceApi()
const orderId = ref("")
const insurance = ref<FamilyInsuranceResponse | null>(null)
const state = ref<"loading" | "ready" | "error">("loading")
const error = ref("")
const needsLogin = ref(false)
const expandedPlans = ref<ReadonlySet<string>>(new Set())
const statusLabels = { ready: "待送交", blocked: "待核对", submitted: "办理中", insured: "已登记保单", failed: "办理未完成", cancellation_requested: "退保处理中" } as const satisfies Record<FamilyInsuranceRecord["status"], string>
const refundLabels = { none: "未退款", pending: "退款处理中", refunded: "已登记退款", failed: "退款处理失败" } as const satisfies Record<FamilyInsuranceResponse["people"][number]["refundStatus"], string>
let generation = 0

onLoad(query => { orderId.value = query?.["orderId"] ?? "" })
onShow(load)
onHide(discard)
onUnload(discard)

function discard(): void {
  generation += 1; insurance.value = null; expandedPlans.value = new Set()
  state.value = "loading"; error.value = ""; needsLogin.value = false
}
function sessionChanged(): void {
  insurance.value = null; expandedPlans.value = new Set(); state.value = "error"
  needsLogin.value = getWechatSessionToken() === undefined
  error.value = "登录状态已变化，请重新加载保障信息。"
}
async function load(): Promise<void> {
  discard()
  const current = generation, id = orderId.value, token = getWechatSessionToken(), owner = getEnrollmentDraftOwner()
  if (!id) { state.value = "error"; error.value = "请从订单详情打开出行保障。"; return }
  if (!token) { state.value = "error"; needsLogin.value = true; error.value = "请先登录后查看出行保障。"; return }
  try {
    const result = await api.getInsurance(id)
    if (current !== generation || id !== orderId.value) return
    if (token !== getWechatSessionToken() || owner !== getEnrollmentDraftOwner()) { sessionChanged(); return }
    insurance.value = result; state.value = "ready"
  } catch (cause) {
    if (current !== generation || id !== orderId.value) return
    if (cause instanceof ApiError && cause.statusCode === 401 && getWechatSessionToken() === undefined) {
      needsLogin.value = true; state.value = "error"; error.value = cause.message; return
    }
    if (token !== getWechatSessionToken() || owner !== getEnrollmentDraftOwner()) { sessionChanged(); return }
    state.value = "error"; error.value = cause instanceof ApiError ? cause.message : "保障信息加载失败，请稍后重试。"
  }
}
function togglePlan(key: string): void {
  const next = new Set(expandedPlans.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedPlans.value = next
}
function summary(plan: InsurancePlan, key: string): string {
  return !expandedPlans.value.has(key) && plan.coverageSummary.length > 160 ? `${plan.coverageSummary.slice(0, 160)}…` : plan.coverageSummary
}
function recordedAt(iso: string): string { return new Date(Date.parse(iso) + 8 * 60 * 60 * 1000).toISOString().slice(0, 16).replace("T", " ") }
function login(): void { uni.navigateTo({ url: "/pages/login/index?returnTo=%2Fpages%2Forders%2Findex" }) }
</script>

<template>
  <view class="discovery-page insurance-page">
    <text class="page-heading">出行保障</text>
    <DiscoveryState :state="state" :message="error" @retry="load" />
    <button v-if="needsLogin" class="button-primary action-gap insurance-login" @tap="login">前往登录</button>
    <view v-if="state === 'ready' && insurance">
      <view class="info-card insurance-current-plan">
        <text class="card-title">当前拟投保方案</text>
        <template v-if="insurance.currentPlan">
          <text class="detail-line insurance-plan-name">{{ insurance.currentPlan.planName }}</text>
          <text class="body-secondary">承保公司：{{ insurance.currentPlan.insurerName }}</text>
          <text class="detail-line insurance-plan-summary">{{ summary(insurance.currentPlan, 'current') }}</text>
          <text v-if="expandedPlans.has('current') && insurance.currentPlan.notice" class="body-secondary insurance-plan-summary">{{ insurance.currentPlan.notice }}</text>
          <button v-if="insurance.currentPlan.coverageSummary.length > 160 || insurance.currentPlan.notice" class="button-secondary action-gap insurance-plan-toggle" :aria-expanded="expandedPlans.has('current')" @tap="togglePlan('current')">{{ expandedPlans.has('current') ? '收起保障说明' : '查看保障说明' }}</button>
          <text class="body-secondary">拟投保方案不代表已完成投保，办理结果请查看下方记录。</text>
        </template>
        <text v-else class="detail-line">保障方案待发布。</text>
      </view>

      <text class="section-heading">参加人办理记录</text>
      <text class="body-secondary">按参加人展示办理记录，最近的记录在前。</text>
      <view v-if="insurance.people.length === 0" class="info-card"><text class="body-secondary">暂无参加人保障记录。</text></view>
      <view v-for="person in insurance.people" :key="person.orderLineId" class="info-card insurance-person">
        <text class="card-title insurance-person-name">{{ person.displayName }}</text>
        <text v-if="person.refundStatus !== 'none'" class="body-secondary">报名退款：{{ refundLabels[person.refundStatus] }}。报名退款状态不代表退保完成。</text>
        <text v-if="person.records.length === 0" class="detail-line insurance-empty-records">暂无办理记录。</text>
        <view v-for="record in person.records" :key="record.batchId" class="insurance-record">
          <view class="insurance-record-heading">
            <text class="badge insurance-record-status" :class="{ 'badge--muted': record.status !== 'insured' }">{{ statusLabels[record.status] }}</text>
            <text class="caption">记录日期：{{ recordedAt(record.createdAt) }}（北京时间）</text>
          </view>
          <text v-if="record.batchStatus === 'change_pending'" class="detail-line insurance-change-notice">本批次变更核对中。</text>
          <text v-if="record.submittedAt" class="body-secondary">送交日期：{{ recordedAt(record.submittedAt) }}（北京时间）</text>
          <template v-if="record.planSnapshot">
            <text class="detail-line">办理时的方案：{{ record.planSnapshot.planName }}</text>
            <text class="body-secondary">承保公司：{{ record.planSnapshot.insurerName }}</text>
            <text class="detail-line insurance-plan-summary">{{ summary(record.planSnapshot, person.orderLineId + ':' + record.batchId) }}</text>
            <text v-if="expandedPlans.has(person.orderLineId + ':' + record.batchId) && record.planSnapshot.notice" class="body-secondary insurance-plan-summary">{{ record.planSnapshot.notice }}</text>
            <button v-if="record.planSnapshot.coverageSummary.length > 160 || record.planSnapshot.notice" class="button-secondary action-gap insurance-plan-toggle" :aria-expanded="expandedPlans.has(person.orderLineId + ':' + record.batchId)" @tap="togglePlan(person.orderLineId + ':' + record.batchId)">{{ expandedPlans.has(person.orderLineId + ':' + record.batchId) ? '收起保障说明' : '查看保障说明' }}</button>
          </template>
          <text v-else class="body-secondary">办理时的方案未记录。</text>
          <text class="detail-line insurance-policy-number">保单号：{{ record.policyNumber ?? '未登记' }}</text>
          <text class="detail-line">保障开始：{{ record.coverageStart ?? '未登记' }}</text>
          <text class="detail-line">保障结束：{{ record.coverageEnd ?? '未登记' }}</text>
        </view>
      </view>
      <button class="button-secondary action-gap insurance-refresh" @tap="load">刷新保障信息</button>
    </view>
  </view>
</template>

<style>
@import "../../styles/discovery.css";
.insurance-record { margin-top: var(--space-4); padding: var(--space-4); border-radius: var(--radius-control); background: var(--surface-secondary); }
.insurance-record-heading { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.insurance-plan-summary { white-space: pre-wrap; }
.insurance-change-notice { color: var(--status-warning); }
</style>
