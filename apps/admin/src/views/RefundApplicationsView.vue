<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { getCurrentStaff } from "@/api/auth"
import { getCapabilities } from "@/api/capabilities"
import { executeRefundApplication, listRefundApplications, reviewRefundApplication, type RefundApplication } from "@/api/refund-applications"
import "@/styles/orders.css"

const status = ref("")
const applications = ref<readonly RefundApplication[]>([])
const loading = ref(false)
const error = ref("")
const notice = ref("")
const reviewReason = ref("")
const busyId = ref("")
const canReview = ref(false)
const canExecute = ref(false)

const statusOptions = [
  { value: "", label: "全部" },
  { value: "submitted", label: "待审核" },
  { value: "approved", label: "审核通过" },
  { value: "rejected", label: "已拒绝" },
  { value: "cancelled", label: "已撤回" },
] as const

const statusLabels = {
  submitted: "待审核",
  approved: "审核通过",
  rejected: "已拒绝",
  cancelled: "已撤回",
} as const satisfies Record<RefundApplication["status"], string>

const refundStatusLabels = {
  pending: "退款处理中",
  succeeded: "退款成功",
  failed: "退款失败",
} as const

const pendingApplications = computed(() => applications.value.filter((item) => item.status === "submitted").length)

onMounted(async () => {
  await load()
})

async function load(): Promise<void> {
  loading.value = true
  error.value = ""
  try {
    const [staff, capabilities] = await Promise.all([getCurrentStaff(), getCapabilities()])
    canReview.value = staff.permissionKeys.includes("refunds.review")
    canExecute.value = staff.permissionKeys.includes("refunds.execute") && capabilities.wechatRefundEnabled
    applications.value = await listRefundApplications(status.value)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "退款申请加载失败"
  } finally {
    loading.value = false
  }
}

async function review(item: RefundApplication, decision: "approved" | "rejected"): Promise<void> {
  if (!canReview.value || busyId.value.length > 0) return
  busyId.value = item.id
  notice.value = ""
  try {
    await reviewRefundApplication(item.id, decision, reviewReason.value)
    reviewReason.value = ""
    await load()
    notice.value = decision === "approved" ? "已批准退款申请" : "已拒绝退款申请"
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "审核失败"
  } finally {
    busyId.value = ""
  }
}

async function execute(item: RefundApplication): Promise<void> {
  if (!canExecute.value || busyId.value.length > 0) return
  busyId.value = item.id
  notice.value = ""
  try {
    await executeRefundApplication(item.id)
    await load()
    notice.value = "已提交微信退款，到账结果以微信通知为准"
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "执行失败"
  } finally {
    busyId.value = ""
  }
}

function formatFen(value: number): string {
  return `¥${(value / 100).toFixed(2)}`
}
</script>

<template>
  <section class="orders-page" aria-labelledby="refund-applications-title" :aria-busy="loading">
    <header class="orders-card orders-heading">
      <div>
        <h2 id="refund-applications-title">退款申请</h2>
        <p>先审核申请，再执行退款。审核通过不代表退款成功，资金结果请查看退款进度。</p>
      </div>
      <button type="button" class="orders-button orders-button--secondary" :disabled="loading || busyId.length > 0" @click="load">{{ loading ? '刷新中…' : '刷新申请' }}</button>
    </header>
    <section class="orders-card">
      <label class="orders-field">申请状态
        <select v-model="status" :disabled="loading || busyId.length > 0" @change="load">
          <option v-for="option in statusOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </label>
      <p v-if="!loading && !error" class="orders-state">当前筛选：{{ applications.length }} 笔，其中待审核 {{ pendingApplications }} 笔。</p>
      <p v-if="notice" class="orders-state" role="status">{{ notice }}</p>
      <p v-if="error" class="orders-error" role="alert">{{ error }} <button type="button" :disabled="loading || busyId.length > 0" @click="load">重试</button></p>
      <p v-if="loading" class="orders-state" role="status">正在加载退款申请…</p>
      <p v-else-if="!error && applications.length === 0" class="orders-state">当前筛选下没有退款申请，可调整申请状态或刷新查看。</p>
      <div v-else-if="!error" class="orders-table-wrap">
        <table class="orders-table" aria-label="退款申请列表">
          <thead><tr><th scope="col">申请 / 订单编号</th><th scope="col">申请审核</th><th scope="col">人员与金额</th><th scope="col">合计</th><th scope="col">退款进度与操作</th></tr></thead>
          <tbody><tr v-for="item in applications" :key="item.id">
            <td data-label="申请 / 订单编号"><div>{{ item.id }}<small>{{ item.orderId }}</small></div></td>
            <td data-label="申请审核">{{ statusLabels[item.status] }}</td>
            <td data-label="人员与金额"><div v-for="line in item.lines" :key="line.lineId"><span>{{ line.displayName }}</span><strong class="orders-money">{{ formatFen(line.amountFen) }}</strong></div></td>
            <td data-label="合计" class="orders-money">{{ formatFen(item.amountFen) }}</td>
            <td data-label="退款进度与操作">
              <div class="refund-actions">
                <template v-if="item.status === 'submitted' && canReview">
                  <label class="orders-field">审核理由<input v-model="reviewReason" :disabled="busyId.length > 0" /></label>
                  <div class="orders-refund-actions">
                    <button type="button" class="orders-button" :disabled="busyId.length > 0" @click="review(item, 'approved')">批准</button>
                    <button type="button" class="orders-button orders-button--secondary" :disabled="busyId.length > 0" @click="review(item, 'rejected')">拒绝</button>
                  </div>
                </template>
                <span v-else-if="item.status === 'submitted'">等待审核人员处理，尚未发起退款</span>
                <template v-else-if="item.status === 'approved' && item.refundRequestId === null">
                  <span>待执行退款</span>
                  <button v-if="canExecute" type="button" class="orders-button" :disabled="busyId.length > 0" @click="execute(item)">执行微信退款</button>
                  <span v-else>等待退款执行人员处理</span>
                </template>
                <template v-else-if="item.refundStatus !== null">
                  <strong>{{ refundStatusLabels[item.refundStatus] }}</strong>
                  <span v-if="item.refundStatus === 'pending'">刷新申请查看最新进度；需查单时请在订单详情中查询微信退款结果。</span>
                  <span v-else-if="item.refundStatus === 'failed'">请到订单详情核对退款说明后再处理。</span>
                </template>
                <span v-else>{{ item.reviewReason ?? (item.status === 'cancelled' ? '申请已撤回，未发起退款' : '申请未通过，未发起退款') }}</span>
                <span v-if="busyId === item.id" role="status">正在处理…</span>
              </div>
            </td>
          </tr></tbody>
        </table>
      </div>
    </section>
  </section>
</template>

<style scoped>
.refund-actions { display: grid; gap: var(--space-2); min-width: 0; }
.refund-actions .orders-field { min-width: 0; }
.refund-actions input { width: 100%; min-width: 0; }
.refund-actions button { justify-self: start; white-space: normal; }
.orders-table td { overflow-wrap: anywhere; }
</style>
