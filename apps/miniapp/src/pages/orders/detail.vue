<script setup lang="ts">
import { computed, nextTick, ref } from "vue"
import { onLoad, onShow } from "@dcloudio/uni-app"
import { createContractApi, type OrderContract } from "../../contract-api"
import { getEnrollmentDraftOwner, getWechatSessionToken } from "../../wechat-token"
import { createMiniappApi, type OrderDetail, type OrderParticipant, type ServiceCapabilities } from "../../api"
import DiscoveryState from "../../components/DiscoveryState.vue"
import ConsultationEntry from "../../components/ConsultationEntry.vue"
import TripServiceEntry from "../../components/TripServiceEntry.vue"
import { formatDateLabel, formatFen, type LoadState } from "../../enrollment-flow"
import { orderStatusLabel, summarizeParticipantPricing } from "../../checkout-flow"
import { readableError } from "../index/page-helpers"
import { decidePendingPaymentAction, paymentCapabilitiesClosed, paymentUnavailableNotice, wechatPaymentFailureMessage } from "../../payment-policy"
import { activeRefundApplicationLineIds, createRefundApplicationClient, type RefundApplication } from "../../refund-applications-api"
const api = createMiniappApi()
const refundsApi = createRefundApplicationClient()
const orderId = ref("")
const order = ref<OrderDetail | null>(null)
const contract = ref<OrderContract | null>(null)
const contractPending = computed(() => contract.value?.status === "pending_parent_signature")
let loadRequest = 0
const refundApplications = ref<readonly RefundApplication[]>([])
const state = ref<LoadState>("loading")
const error = ref("")
const paying = ref(false)
const cancelling = ref(false)
const capabilities = ref<ServiceCapabilities>(paymentCapabilitiesClosed)
const pendingPaymentAction = computed(() => decidePendingPaymentAction({
  paying: paying.value,
  capabilities: capabilities.value,
}))
const paymentButtonText = computed(() => contractPending.value ? "阅读合同并签字" : pendingPaymentAction.value.buttonText)
const paymentActionDisabled = computed(() => cancelling.value || (contractPending.value ? paying.value : pendingPaymentAction.value.disabled))
const paymentModeNotice = computed(() => pendingPaymentAction.value.notice)
const participantPricing = computed(() => summarizeParticipantPricing(order.value?.participants ?? []))
const activeRefundLineIds = computed(() => activeRefundApplicationLineIds(refundApplications.value))
const refundableParticipantCount = computed(() => (order.value?.participants ?? []).filter((person) =>
  (person.refundStatus === "none" || person.refundStatus === "failed")
  && person.amountFen > person.refundedFen
  && !activeRefundLineIds.value.has(person.id),
).length)
const canApplyRefund = computed(() => order.value?.status === "paid" && refundableParticipantCount.value > 0)
const hasPrimaryAction = computed(() => order.value?.status === "pending_payment" || canApplyRefund.value)
const applicationStatusLabels = { submitted: "待审核", approved: "审核通过", rejected: "已拒绝", cancelled: "已撤回" } as const
const refundSummaryLabels = { none: "尚无成功退款", partial: "部分退款", full: "全部退款" } as const satisfies Record<OrderDetail["refundSummary"]["status"], string>
const participantRefundLabels = { none: "未退款", pending: "退款处理中", refunded: "已登记退款", failed: "退款处理失败" } as const satisfies Record<OrderParticipant["refundStatus"], string>
const refundHistoryLabels = { pending: "处理中", succeeded: "已处理", failed: "处理失败" } as const satisfies Record<OrderDetail["refundHistory"][number]["status"], string>
onLoad((query) => { orderId.value = query?.["orderId"] ?? ""; void load() })
onShow(() => { if (orderId.value && state.value !== "loading") void load() })
async function load(): Promise<OrderDetail | undefined> {
  if (cancelling.value) return
  const generation = ++loadRequest, id = orderId.value, owner = getEnrollmentDraftOwner(), token = getWechatSessionToken()
  state.value = "loading"; error.value = ""
  order.value = null; contract.value = null
  await nextTick()
  uni.pageScrollTo({ scrollTop: 0, duration: 0 })
  try {
    const [detail, nextCapabilities, nextContract] = await Promise.all([api.getOrderDetail(id), api.getCapabilities(), createContractApi().getContract(id)])
    const nextRefundApplications = detail.status === "paid" ? await refundsApi.listRefundApplications(orderId.value) : []
    if (generation !== loadRequest || id !== orderId.value || owner !== getEnrollmentDraftOwner() || token !== getWechatSessionToken()) return
    order.value = detail
    contract.value = nextContract
    capabilities.value = nextCapabilities
    refundApplications.value = nextRefundApplications
    state.value = "ready"
    return detail
  }
  catch (cause) {
    if (generation !== loadRequest || owner !== getEnrollmentDraftOwner() || token !== getWechatSessionToken()) return
    state.value = "error"; error.value = readableError(cause, "订单详情或合同加载失败，请重试")
  }
}
function openContract(): void { uni.navigateTo({ url: `/pages/orders/contract?orderId=${encodeURIComponent(orderId.value)}` }) }
async function pay(): Promise<void> {
  if (paying.value || cancelling.value || order.value?.status !== "pending_payment") return
  if (contractPending.value) { openContract(); return }
  if (!pendingPaymentAction.value.canStartWechatPayment) {
    error.value = paymentUnavailableNotice
    return
  }
  paying.value = true; error.value = ""
  const owner = getEnrollmentDraftOwner(), token = getWechatSessionToken(), id = orderId.value
  let contractChecked = false
  try {
    const currentContract = await createContractApi().getContract(id)
    if (owner !== getEnrollmentDraftOwner() || token !== getWechatSessionToken() || id !== orderId.value) return
    contract.value = currentContract
    if (currentContract?.status === "pending_parent_signature") { openContract(); return }
    contractChecked = true
    const code = await loginForWechatPayment()
    if (owner !== getEnrollmentDraftOwner() || token !== getWechatSessionToken() || id !== orderId.value) return
    const payment = await api.createWechatPayment(orderId.value, code)
    if (owner !== getEnrollmentDraftOwner() || token !== getWechatSessionToken() || id !== orderId.value) return
    await requestWechatPayment(payment.miniappPayment)
    const detail = await load()
    const confirmed = detail?.status === "paid"
    uni.showModal({
      title: confirmed ? "支付成功" : "支付结果确认中",
      content: confirmed
        ? `已支付 ${formatFen(detail.paidFen)}，报名已完成。您可在订单详情查看报名信息。`
        : "正在确认订单支付结果，请勿重复付款。请稍后刷新订单状态。",
      showCancel: false,
      confirmText: "我知道了",
    })
  }
  catch (cause) { error.value = contractChecked ? wechatPaymentFailureMessage(cause) : readableError(cause, "合同加载失败，请重试后继续付款。") }
  finally { paying.value = false }
}

async function loginForWechatPayment(): Promise<string> {
  return await new Promise((resolve, reject) => {
    uni.login({ provider: "weixin", success: (result) => {
      if (typeof result.code === "string" && result.code.length > 0) resolve(result.code)
      else reject(new Error("暂时无法确认微信身份，请重试"))
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

function openInsurance(): void {
  if (order.value === null) return
  uni.navigateTo({ url: `/pages/orders/insurance?orderId=${encodeURIComponent(order.value.id)}` })
}

function openNotifications(): void {
  if (order.value === null) return
  uni.navigateTo({ url: "/pages/notifications/index" })
}

async function cancelPayment(): Promise<void> {
  if (paying.value || cancelling.value || order.value?.status !== "pending_payment") return
  const owner = getEnrollmentDraftOwner(), token = getWechatSessionToken(), id = orderId.value
  cancelling.value = true
  error.value = ""
  try {
    const confirmed = await new Promise<boolean>((resolve) => uni.showModal({
      title: "取消支付？",
      content: "取消后本订单将关闭，如需参加可重新报名。",
      confirmText: "取消支付",
      cancelText: "继续保留",
      success: result => resolve(result.confirm === true),
      fail: () => resolve(false),
    }))
    if (!confirmed || owner !== getEnrollmentDraftOwner() || token !== getWechatSessionToken() || id !== orderId.value) return
    const cancelled = await api.cancelOrder(id)
    if (owner !== getEnrollmentDraftOwner() || token !== getWechatSessionToken() || id !== orderId.value) return
    if (cancelled.status !== "cancelled") throw new Error("订单状态已变化，请刷新后查看。")
    if (order.value?.id === id) order.value = { ...order.value, ...cancelled }
    if (owner === getEnrollmentDraftOwner() && token === getWechatSessionToken() && id === orderId.value) {
      uni.showToast({ title: "订单已取消", icon: "none" })
    }
  } catch (cause) {
    if (owner === getEnrollmentDraftOwner() && token === getWechatSessionToken() && id === orderId.value) {
      error.value = readableError(cause, "取消未完成，请刷新订单状态后重试。")
      uni.showToast({ title: error.value, icon: "none", duration: 3000 })
    }
  } finally { cancelling.value = false }
}

function openRefund(): void {
  if (order.value === null) return
  uni.navigateTo({ url: `/pages/orders/refund?orderId=${encodeURIComponent(order.value.id)}` })
}

function openChangeRequest(): void {
  if (order.value === null) return
  uni.navigateTo({ url: `/pages/orders/change?orderId=${encodeURIComponent(order.value.id)}` })
}

function participantPlacement(person: OrderParticipant): string {
  if (person.participantKind === "adult") {
    return "成人 · 无需年级班级"
  }
  return `${person.gradeName ?? "年级未记录"} · ${person.className ?? "班级未记录"}`
}
</script>

<template>
  <view class="discovery-page order-detail-page" :class="{ 'order-detail-page--with-action': hasPrimaryAction }">
    <text class="page-heading">订单详情</text>
    <DiscoveryState :state="state" :message="error" @retry="load" />
    <view v-if="state === 'ready' && order">
      <view v-if="contract" class="info-card">
        <text class="card-title">{{ contractPending ? '合同待本人签字' : '本人已签字，待旅行社处理' }}</text>
        <text class="body-secondary">{{ contract.template.title }} · {{ contract.template.version }}</text>
        <text class="body-secondary">{{ contract.scopeStatement }}</text>
        <button class="button-secondary action-gap" @tap="openContract">{{ contractPending ? '阅读合同并签字' : '查看合同与签字' }}</button>
      </view>
      <view class="info-card">
        <view class="row-between order-overview"><text class="caption">{{ order.code }}</text><text class="badge order-status">{{ orderStatusLabel(order) }}{{ order.refundSummary.status === 'partial' ? ' · 部分退款' : order.refundSummary.status === 'full' ? ' · 全部退款' : '' }}</text></view>
        <text class="caption order-activity-label">活动名称</text>
        <text class="card-title order-title">{{ order.activityTitle }}</text>
        <text class="detail-line">{{ order.schoolName }} · {{ formatDateLabel(order.startsAt) }} 至 {{ formatDateLabel(order.endsAt) }}</text>
        <text class="detail-line">付款人：{{ order.payerName }}</text><text class="detail-line">联系人：{{ order.contactName }}</text>
        <text class="detail-line">紧急联系人：{{ order.emergencyContactName ?? '未提供' }}</text><text class="detail-line">紧急联系电话：{{ order.emergencyContactPhone ?? '未提供' }}</text>
        <view class="payment-summary" aria-label="订单金额">
          <view class="row-between"><text class="payment-summary__label">应付总额</text><text class="badge">{{ order.participantCount }} 人</text></view>
          <text class="payment-summary__total">{{ formatFen(order.amountFen) }}</text>
          <text v-if="participantPricing.kind === 'uniform'" class="payment-summary__breakdown">活动单价 {{ formatFen(participantPricing.unitAmountFen) }} / 人 × {{ participantPricing.participantCount }} 人</text>
          <text v-else class="payment-summary__breakdown">按参加人员报名金额合计 · {{ participantPricing.participantCount }} 人</text>
          <view class="row-between payment-summary__paid"><text>已支付</text><text class="payment-summary__paid-value">{{ formatFen(order.paidFen) }}</text></view>
        </view>
        <text v-if="order.status === 'pending_payment'" class="payment-followup">完成支付后，如需退订，可在订单详情按参加人申请退款。</text>
      </view>
      <view class="info-card order-services">
        <text class="card-title">订单服务</text>
        <button v-if="order.status === 'paid'" class="button-primary order-pretrip-entry" @tap="openPretrip">查看行前信息</button>
        <text v-if="order.status === 'refunded'" class="body-secondary">订单已退款，可查看原订单的行前信息和相关记录。</text>
        <view class="order-services__grid">
          <button class="button-secondary insurance-order-entry" @tap="openInsurance">出行保障</button>
          <button v-if="order.status === 'paid'" class="button-secondary" @tap="openAlbum">查看活动影像</button>
          <button v-if="order.status === 'paid'" class="button-secondary" @tap="openChangeRequest"><text class="order-service-phrase">换人或</text><text class="order-service-phrase">增补申请</text></button>
          <button v-if="order.status === 'refunded'" class="button-secondary" @tap="openPretrip">查看原行前信息</button>
          <button v-if="order.status === 'paid' || order.status === 'refunded'" class="button-secondary" @tap="openFeedback">提交意见反馈</button>
          <button class="button-secondary health-order-entry" @tap="openHealth"><text class="order-service-phrase">健康信息</text><text class="order-service-phrase">与授权</text></button>
          <button class="button-secondary notification-order-entry" @tap="openNotifications">消息订阅</button>
          <ConsultationEntry :context="{ source: 'order', id: order.id }" />
          <view v-if="order.status === 'paid'" class="order-services__wide">
            <TripServiceEntry :order-id="order.id" />
          </view>
        </view>
      </view>
      <view v-if="order.status !== 'pending_payment' || order.refundHistory.length > 0" class="info-card refund-summary">
        <text class="card-title">退款记录</text>
        <text class="detail-line">{{ refundSummaryLabels[order.refundSummary.status] }}</text>
        <text class="detail-line">累计已退金额：{{ formatFen(order.refundSummary.refundedFen) }}</text>
        <text class="detail-line">处理中金额：{{ formatFen(order.refundSummary.pendingFen) }}</text>
        <text v-if="order.refundSummary.failedCount > 0" class="detail-line">处理失败：{{ order.refundSummary.failedCount }} 笔</text>
        <text v-if="order.refundHistory.length === 0" class="body-secondary">暂无退款记录</text>
        <text class="test-notice">退款到账情况可查看微信支付记录或工作人员通知。</text>
      </view>
      <view v-if="refundApplications.length > 0" class="info-card">
        <text class="card-title">退款申请进度</text>
        <text v-for="application in refundApplications" :key="application.id" class="detail-line">{{ applicationStatusLabels[application.status] }} · {{ formatFen(application.amountFen) }}</text>
        <button class="button-secondary action-gap" @tap="openRefund">查看退款申请</button>
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
      <text class="test-notice">本页展示报名时的人员和金额。{{ paymentModeNotice }}</text>
      <text v-if="error" class="test-notice">{{ error }}</text>
      <button class="button-secondary action-gap" @tap="load">刷新订单状态</button>
    </view>
    <view v-if="state === 'ready' && order && hasPrimaryAction" class="order-action-bar" :class="{ 'order-action-bar--pending': order.status === 'pending_payment' }">
      <view class="order-action-bar__summary">
        <text class="order-action-bar__label">{{ order.status === 'pending_payment' ? '待支付' : '可申请退款' }}</text>
        <text class="order-action-bar__value">{{ order.status === 'pending_payment' ? formatFen(order.amountFen) : `${refundableParticipantCount} 人可选` }}</text>
      </view>
      <button v-if="order.status === 'pending_payment'" class="button-secondary order-action-bar__button cancel-payment-action" :disabled="paying || cancelling" @tap="cancelPayment">{{ cancelling ? '正在取消…' : '取消支付' }}</button>
      <button v-if="order.status === 'pending_payment'" class="button-primary order-action-bar__button payment-primary-action" :disabled="paymentActionDisabled" @tap="pay">
        {{ !contractPending && pendingPaymentAction.canStartWechatPayment && !paying ? `${paymentButtonText} · ${formatFen(order.amountFen)}` : paymentButtonText }}
      </button>
      <button v-else class="button-primary order-action-bar__button refund-primary-action" @tap="openRefund">申请退款</button>
    </view>
  </view>
</template>

<style>
@import "../../styles/discovery.css";
.order-services > .card-title { margin-top: 0; }
.order-pretrip-entry { width: 100%; margin-top: var(--space-4); }
.order-services__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); margin-top: var(--space-4); }
.order-services__wide { grid-column: 1 / -1; }
.order-service-phrase { display: inline-block; white-space: nowrap; }
.order-services__grid .button-secondary { width: 100%; min-width: 0; padding: var(--space-2); font-size: var(--font-body-sm); line-height: 1.5; }
.order-overview { flex-wrap: wrap; }
.order-status { max-width: 100%; white-space: normal; }
.order-activity-label { display: block; margin-top: var(--space-4); }
.order-title { text-wrap: balance; }
.payment-summary { margin-top: var(--space-5); padding: var(--space-4); border-radius: var(--radius-card); background: var(--accent-soft); }
.payment-summary__label { color: var(--text-primary); font-size: var(--font-body-sm); font-weight: 600; }
.payment-summary__total { display: block; margin-top: var(--space-2); color: var(--accent-warm); font-size: var(--font-display); font-weight: 700; line-height: 1.2; font-variant-numeric: tabular-nums; }
.payment-summary__breakdown { display: block; margin-top: var(--space-2); color: var(--text-secondary); font-size: var(--font-body-sm); line-height: 1.5; }
.payment-summary__paid { margin-top: var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--border-subtle); color: var(--text-secondary); font-size: var(--font-body-sm); }
.payment-summary__paid-value { color: var(--text-primary); font-weight: 600; font-variant-numeric: tabular-nums; }
.payment-followup { display: block; margin-top: var(--space-3); color: var(--text-secondary); font-size: var(--font-body-sm); line-height: 1.6; }
.order-detail-page--with-action { padding-bottom: calc(156px + env(safe-area-inset-bottom)); }
.order-action-bar { position: fixed; z-index: var(--layer-sticky); right: 0; bottom: 0; left: 0; display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom)); border-top: 1px solid var(--border-subtle); background: var(--surface-elevated); }
.order-action-bar__summary { flex: 0 0 auto; min-width: 88px; }
.order-action-bar__label { display: block; color: var(--text-secondary); font-size: var(--font-caption); line-height: 1.4; }
.order-action-bar__value { display: block; margin-top: var(--space-1); color: var(--accent-warm); font-size: var(--font-body); font-weight: 700; line-height: 1.4; font-variant-numeric: tabular-nums; }
.order-action-bar__button { flex: 1; min-width: 0; }
.order-action-bar--pending { flex-wrap: wrap; }
.order-action-bar--pending .order-action-bar__summary { flex-basis: 100%; display: flex; align-items: center; justify-content: space-between; }
.order-action-bar--pending .order-action-bar__value { margin-top: 0; }
.order-action-bar--pending .order-action-bar__button { min-height: var(--size-touch-target); margin: 0; padding: var(--space-3) var(--space-2); font-size: var(--font-body-sm); line-height: 1.5; }
</style>
