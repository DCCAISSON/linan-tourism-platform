<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { getCurrentStaff } from "@/api/auth"
import { getCapabilities } from "@/api/capabilities"
import { executeRefundApplication, listRefundApplications, reviewRefundApplication, type RefundApplication } from "@/api/refund-applications"

const status = ref("")
const applications = ref<readonly RefundApplication[]>([])
const loading = ref(false)
const error = ref("")
const notice = ref("")
const reviewReason = ref("")
const executionFailure = ref("")
const busyId = ref("")
const canReview = ref(false)
const canExecute = ref(false)

const statusOptions = [
  { value: "", label: "全部" },
  { value: "submitted", label: "待审核" },
  { value: "approved", label: "已批准" },
  { value: "rejected", label: "已拒绝" },
  { value: "cancelled", label: "已撤回" },
] as const

const statusLabels = {
  submitted: "待审核",
  approved: "已批准",
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
  const [staff, capabilities] = await Promise.all([getCurrentStaff(), getCapabilities()])
  canReview.value = staff.permissionKeys.includes("refunds.review")
  canExecute.value = staff.permissionKeys.includes("refunds.execute") && capabilities.wechatRefundEnabled
  await load()
})

async function load(): Promise<void> {
  loading.value = true
  error.value = ""
  try {
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

async function execute(item: RefundApplication, outcome: "succeeded" | "failed"): Promise<void> {
  if (!canExecute.value || busyId.value.length > 0) return
  busyId.value = item.id
  notice.value = ""
  try {
    await executeRefundApplication(item.id, outcome, outcome === "failed" ? executionFailure.value : null)
    executionFailure.value = ""
    await load()
    notice.value = outcome === "succeeded" ? "退款执行成功" : "已登记退款失败"
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
  <main class="orders-page">
    <section class="orders-toolbar">
      <div>
        <h1>退款申请</h1>
        <p>家庭提交申请后先审核，执行退款会重新校验余额。资金到账以支付渠道或财务确认为准。</p>
      </div>
      <el-select v-model="status" class="orders-filter" @change="load">
        <el-option v-for="option in statusOptions" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
    </section>
    <section class="orders-summary">
      <span>待审核：{{ pendingApplications }} 笔</span>
      <span>总申请：{{ applications.length }} 笔</span>
    </section>
    <el-alert v-if="notice" type="success" :title="notice" show-icon />
    <el-alert v-if="error" type="error" :title="error" show-icon />
    <el-table v-loading="loading" :data="applications" class="orders-table">
      <el-table-column prop="id" label="申请编号" min-width="180" />
      <el-table-column prop="orderId" label="订单编号" min-width="180" />
      <el-table-column label="状态" width="120">
        <template #default="{ row }">{{ statusLabels[row.status as RefundApplication['status']] }}</template>
      </el-table-column>
      <el-table-column label="人员与金额" min-width="220">
        <template #default="{ row }">
          <div v-for="line in (row as RefundApplication).lines" :key="line.lineId" class="orders-participant-line">
            <span>{{ line.displayName }}</span>
            <strong>{{ formatFen(line.amountFen) }}</strong>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="合计" width="120">
        <template #default="{ row }">{{ formatFen((row as RefundApplication).amountFen) }}</template>
      </el-table-column>
      <el-table-column label="审核/执行" min-width="280">
        <template #default="{ row }">
          <div class="refund-actions">
            <el-input v-if="row.status === 'submitted' && canReview" v-model="reviewReason" placeholder="审核理由" size="small" />
            <div v-if="row.status === 'submitted' && canReview" class="refund-action-row">
              <el-button size="small" type="primary" :loading="busyId === row.id" @click="review(row, 'approved')">批准</el-button>
              <el-button size="small" :loading="busyId === row.id" @click="review(row, 'rejected')">拒绝</el-button>
            </div>
            <span v-else-if="row.status === 'submitted'">等待审核人员处理</span>
            <div v-else-if="row.status === 'approved' && row.refundRequestId === null && canExecute">
              <el-input v-model="executionFailure" placeholder="失败时填写原因" size="small" />
              <div class="refund-action-row">
                <el-button size="small" type="primary" :loading="busyId === row.id" @click="execute(row, 'succeeded')">执行成功</el-button>
                <el-button size="small" :loading="busyId === row.id" @click="execute(row, 'failed')">执行失败</el-button>
              </div>
            </div>
            <span v-else-if="row.status === 'approved' && row.refundRequestId === null">审核通过，等待退款执行人员处理</span>
            <span v-else>{{ row.refundStatus === null ? row.reviewReason ?? "已处理" : refundStatusLabels[row.refundStatus as keyof typeof refundStatusLabels] }}</span>
          </div>
        </template>
      </el-table-column>
    </el-table>
  </main>
</template>
