<template>
  <section class="orders-page" aria-labelledby="orders-title">
    <header class="orders-card orders-heading">
      <div>
        <p class="orders-eyebrow">业务订单</p>
        <h2 id="orders-title">订单管理</h2>
        <p>核对报名人员、付款状态与历史费用，按取消人员登记退款。</p>
      </div>
      <button type="button" class="orders-button orders-button--secondary" :disabled="loading" @click="loadOrders">{{ loading ? "刷新中..." : "刷新订单" }}</button>
    </header>

    <section class="orders-card" aria-label="订单查询">
      <form class="orders-filters" @submit.prevent="search">
        <label class="orders-field">订单号或付款人
          <input v-model="keyword" type="search" maxlength="64" placeholder="输入订单号或付款人" />
        </label>
        <label class="orders-field">支付状态
          <select v-model="status">
            <option value="">全部状态</option>
            <option value="pending_payment">待支付</option>
            <option value="paid">已支付</option>
            <option value="cancelled">已取消</option>
            <option value="refunded">已退款</option>
          </select>
        </label>
        <button type="submit" class="orders-button" :disabled="loading">{{ loading ? "查询中..." : "查询订单" }}</button>
      </form>
      <p v-if="listError" class="orders-error" role="alert">{{ listError }} <button type="button" @click="loadOrders">重试</button></p>
      <p v-if="loading" class="orders-state" role="status">正在加载订单...</p>
      <p v-else-if="list && list.orders.length === 0" class="orders-state">没有符合条件的订单，请调整筛选条件。</p>
      <template v-else-if="list && list.orders.length > 0">
        <div class="orders-table-wrap">
          <table class="orders-table" aria-label="订单列表">
            <thead><tr><th scope="col">订单与活动</th><th scope="col">学校与团期</th><th scope="col">付款人</th><th scope="col">人数</th><th scope="col">应付 / 已付</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead>
            <tbody><tr v-for="order in list.orders" :key="order.id">
              <td data-label="订单与活动"><strong>{{ order.activityTitle }}</strong><small>{{ order.code }}</small></td>
              <td data-label="学校与团期">{{ order.schoolName }}<small>{{ formatDate(order.startsAt) }}</small></td>
              <td data-label="付款人">{{ order.payerName }}</td>
              <td data-label="人数">{{ order.participantCount }} 人</td>
              <td data-label="应付 / 已付" class="orders-money">{{ formatFen(order.amountFen) }} / {{ formatFen(order.paidFen) }}</td>
              <td data-label="状态"><span class="orders-status" :class="`orders-status--${order.status}`">{{ statusText(order.status) }}</span></td>
              <td data-label="操作"><button type="button" class="orders-link" :disabled="refundBusy" @click="openDetail(order.id)">查看详情</button></td>
            </tr></tbody>
          </table>
        </div>
        <div class="orders-pager">
          <span>共 {{ list.total }} 单，第 {{ list.page }} 页</span>
          <div><button type="button" :disabled="loading || page <= 1" @click="changePage(page - 1)">上一页</button><button type="button" :disabled="loading || page * list.pageSize >= list.total" @click="changePage(page + 1)">下一页</button></div>
        </div>
      </template>
    </section>

    <section v-if="selectedId" class="orders-card orders-detail" aria-labelledby="order-detail-title">
      <div class="orders-section-heading"><h3 id="order-detail-title">订单详情</h3><button type="button" class="orders-link" :disabled="refundBusy" @click="closeDetail">关闭详情</button></div>
      <p v-if="detailLoading" class="orders-state" role="status">正在加载订单详情...</p>
      <p v-if="detailError" class="orders-error" role="alert">{{ detailError }} <button type="button" @click="openDetail(selectedId)">重试</button></p>
      <template v-if="detail">
        <dl class="orders-facts">
          <div><dt>订单号</dt><dd>{{ detail.code }}</dd></div><div><dt>活动</dt><dd>{{ detail.activityTitle }}</dd></div>
          <div><dt>学校</dt><dd>{{ detail.schoolName }}</dd></div><div><dt>付款状态</dt><dd>{{ statusText(detail.status) }}{{ detail.refundSummary.status === 'partial' ? '（部分退款）' : '' }}</dd></div>
          <div><dt>联系人</dt><dd>{{ detail.contactName }}</dd></div>
          <div><dt>联系电话</dt><dd>{{ detail.contactPhone || '未登记' }}</dd></div>
          <div><dt>紧急联系人</dt><dd>{{ detail.emergencyContactName || '未登记' }}</dd></div>
          <div><dt>紧急联系电话</dt><dd>{{ detail.emergencyContactPhone || '未登记' }}</dd></div>
          <div><dt>应付 / 已付</dt><dd>{{ formatFen(detail.amountFen) }} / {{ formatFen(detail.paidFen) }}</dd></div>
          <div><dt>已退款 / 待处理</dt><dd>{{ formatFen(detail.refundSummary.refundedFen) }} / {{ formatFen(detail.refundSummary.pendingFen) }}</dd></div>
        </dl>
        <div class="orders-section-heading"><h3>参加人员</h3><span>{{ detail.participants.length }} 人</span></div>
        <div class="orders-lines">
          <label v-for="line in detail.participants" :key="line.id" class="orders-line">
            <input v-if="canManage" v-model="selectedLineIds" type="checkbox" :value="line.id" :disabled="detail.status !== 'paid' || line.refundStatus === 'pending' || line.refundStatus === 'refunded' || refundBusy" :aria-label="`选择取消 ${line.displayName}`" @change="clearConfirmation" />
            <span><strong>{{ line.displayName }}</strong><small>{{ line.gradeName ?? "未设置年级" }} · {{ line.className ?? "未设置班级" }}</small><small>{{ participantRefundText(line.refundStatus) }} · 已退 {{ formatFen(line.refundedFen) }}</small></span>
            <b class="orders-money">{{ formatFen(line.amountFen) }}</b>
          </label>
        </div>
        <div class="orders-refund">
          <h3>人员退款</h3>
          <p>退款由工作人员按财务流程处理，资金到账以支付渠道或财务确认为准。</p>
          <p>按所选人员尚可退的历史实付金额退款，不按提前天数扣费。处理成功后取消对应人员的名单并释放名额。</p>
          <form v-if="canManage && detail.status === 'paid'" class="orders-refund-form" @submit.prevent="confirmation = { kind: 'create' }">
            <label class="orders-field">退款原因（必填）<input v-model="reason" required maxlength="255" :disabled="refundBusy" @input="clearConfirmation" /></label>
            <label class="orders-field">备注（选填）<input v-model="note" maxlength="1000" :disabled="refundBusy" @input="clearConfirmation" /></label>
            <p class="orders-quote">本次退款：{{ formatFen(selectedAmountFen) }}<small>已选 {{ selectedLineIds.length }} 人，最终金额由服务端核定</small></p>
            <button type="submit" class="orders-button" :disabled="selectedLineIds.length === 0 || !reason.trim() || refundBusy">{{ refundBusy ? "处理中..." : "创建退款" }}</button>
          </form>
          <p v-if="canManage && detail.status !== 'paid'" class="orders-state">当前订单不可创建退款。</p>
          <div v-if="confirmation?.kind === 'create'" class="orders-confirmation" role="group" aria-label="确认创建退款">
            <p>确认对 {{ selectedLineIds.length }} 人创建 {{ formatFen(selectedAmountFen) }} 的退款请求？原因：{{ reason }}。创建后等待人工处理。</p>
            <div class="orders-refund-actions"><button type="button" class="orders-button" :disabled="refundBusy" @click="createRefund">确认创建退款</button><button type="button" class="orders-button orders-button--secondary" :disabled="refundBusy" @click="confirmation = undefined">返回修改</button></div>
          </div>
          <p v-if="refundError" class="orders-error" role="alert">{{ refundError }}</p>
          <p v-if="refundMessage" class="orders-state" role="status">{{ refundMessage }}</p>
          <h3 class="orders-history-title">退款记录</h3>
          <p v-if="detail.refundHistory.length === 0" class="orders-state">暂无退款记录。</p>
          <article v-for="refund in detail.refundHistory" :key="refund.id" class="orders-refund-record" aria-label="退款记录">
            <div class="orders-section-heading"><strong>{{ refundText(refund.status) }}</strong><b class="orders-money">{{ formatFen(refund.amountFen) }}</b></div>
            <p>人员：{{ refund.lines.map(line => line.displayName).join('、') }}</p><p>原因：{{ refund.reason }}</p><p v-if="refund.note">备注：{{ refund.note }}</p>
            <p>创建：{{ formatDate(refund.requestedAt) }}<template v-if="refund.processedAt"> · 处理：{{ formatDate(refund.processedAt) }}</template></p>
            <p v-if="refund.status === 'failed'" class="orders-error">失败说明：{{ refund.failureMessage ?? '处理失败' }}。可重新选择人员创建退款。</p>
            <div v-if="canManage && refund.status === 'pending'" class="orders-refund-actions"><button type="button" class="orders-button" :disabled="refundBusy" @click="confirmation = { kind: 'process', refundId: refund.id, outcome: 'succeeded' }">处理成功</button><button type="button" class="orders-button orders-button--secondary" :disabled="refundBusy" @click="confirmation = { kind: 'process', refundId: refund.id, outcome: 'failed' }">处理失败</button></div>
            <div v-if="confirmation?.kind === 'process' && confirmation.refundId === refund.id" class="orders-confirmation" role="group" :aria-label="`确认${refundText(confirmation.outcome)}`">
              <p>确认将 {{ formatFen(refund.amountFen) }} 记录为{{ refundText(confirmation.outcome) }}？{{ confirmation.outcome === 'succeeded' ? '这会取消对应人员的名单并释放名额。' : '这会保留失败记录，人员和名额不变。' }}</p>
              <div class="orders-refund-actions"><button type="button" class="orders-button" :disabled="refundBusy" @click="processRefund">确认{{ refundText(confirmation.outcome) }}</button><button type="button" class="orders-button orders-button--secondary" :disabled="refundBusy" @click="confirmation = undefined">取消操作</button></div>
            </div>
          </article>
        </div>
      </template>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { getCurrentStaff } from "@/api/auth"
import { getCapabilities } from "@/api/capabilities"
import { createStaffRefund, getStaffOrder, listStaffOrders, processStaffRefund } from "@/api/orders"
import type { RefundHistoryItem, StaffOrder, StaffOrderDetail, StaffOrderList } from "@/api/orders"
import { readableRosterError } from "@/api/roster.errors"
import { formatFen } from "@/views/roster/format"
import "@/styles/orders.css"

const keyword = ref("")
const status = ref("")
const page = ref(1)
const list = ref<StaffOrderList>()
const loading = ref(false)
const listError = ref("")
const selectedId = ref("")
const detail = ref<StaffOrderDetail>()
const detailLoading = ref(false)
const detailError = ref("")
const selectedLineIds = ref<string[]>([])
const canManage = ref(false)
const reason = ref("")
const note = ref("")
const idempotencyKey = ref("")
const confirmation = ref<{ readonly kind: "create" } | { readonly kind: "process"; readonly refundId: string; readonly outcome: "succeeded" | "failed" }>()
const selectedAmountFen = computed(() => detail.value?.participants.filter(line => selectedLineIds.value.includes(line.id)).reduce((sum, line) => sum + line.amountFen - line.refundedFen, 0) ?? 0)
const refundBusy = ref(false)
const refundError = ref("")
const refundMessage = ref("")

async function loadOrders(): Promise<void> {
  loading.value = true
  listError.value = ""
  try { list.value = await listStaffOrders(keyword.value.trim(), status.value, page.value) }
  catch (error) { list.value = undefined; listError.value = readableRosterError(error) }
  finally { loading.value = false }
}
function search(): void { page.value = 1; void loadOrders() }
function changePage(next: number): void { page.value = next; void loadOrders() }
async function openDetail(id: string): Promise<void> {
  selectedId.value = id
  detail.value = undefined
  detailError.value = ""
  selectedLineIds.value = []
  reason.value = ""; note.value = ""; refundMessage.value = ""; clearConfirmation()
  detailLoading.value = true
  try { detail.value = await getStaffOrder(id) }
  catch (error) { detailError.value = readableRosterError(error) }
  finally { detailLoading.value = false }
}
function closeDetail(): void { selectedId.value = ""; detail.value = undefined; selectedLineIds.value = []; clearConfirmation() }
function clearConfirmation(): void { confirmation.value = undefined; idempotencyKey.value = ""; refundError.value = "" }
async function refreshDetail(id: string): Promise<void> {
  try { detail.value = await getStaffOrder(id) }
  catch (error) { detail.value = undefined; detailError.value = readableRosterError(error) }
}
async function createRefund(): Promise<void> {
  if (!canManage.value || !detail.value || refundBusy.value || selectedLineIds.value.length === 0 || !reason.value.trim()) return
  const id = detail.value.id
  refundBusy.value = true
  refundError.value = ""; refundMessage.value = ""
  idempotencyKey.value ||= crypto.randomUUID()
  try {
    await createStaffRefund(id, { lineIds: selectedLineIds.value, reason: reason.value.trim(), ...(note.value.trim() ? { note: note.value.trim() } : {}), idempotencyKey: idempotencyKey.value })
    selectedLineIds.value = []; reason.value = ""; note.value = ""; clearConfirmation()
    await refreshDetail(id)
    refundMessage.value = "退款请求已保存，等待人工处理。"
  }
  catch (error) { refundError.value = readableRosterError(error) }
  finally { refundBusy.value = false }
}
async function processRefund(): Promise<void> {
  if (!canManage.value || !detail.value || refundBusy.value || confirmation.value?.kind !== "process") return
  const id = detail.value.id
  const { refundId, outcome } = confirmation.value
  refundBusy.value = true
  refundError.value = ""; refundMessage.value = ""
  try {
    const result = await processStaffRefund(id, refundId, outcome)
    selectedLineIds.value = []; clearConfirmation()
    await refreshDetail(id)
    await loadOrders()
    switch (result.status) {
      case "succeeded": refundMessage.value = "处理结果已保存，订单、名单和名额已更新。"; break
      case "failed": refundMessage.value = "失败记录已保存，可重新选择人员创建退款。"; break
      case "pending": refundMessage.value = "退款仍待处理，请核对退款记录。"; break
    }
  } catch (error) { refundError.value = readableRosterError(error) }
  finally { refundBusy.value = false }
}
function refundText(value: RefundHistoryItem["status"]): string {
  switch (value) { case "pending": return "待处理"; case "succeeded": return "处理成功"; case "failed": return "处理失败" }
}
function participantRefundText(value: StaffOrderDetail["participants"][number]["refundStatus"]): string {
  switch (value) { case "none": return "未退款"; case "pending": return "退款待处理"; case "refunded": return "已退款"; case "failed": return "退款失败，可重试" }
}
function statusText(value: StaffOrder["status"]): string {
  switch (value) {
    case "pending_payment": return "待支付"
    case "paid": return "已支付"
    case "cancelled": return "已取消"
    case "refunded": return "已退款"
  }
}
function formatDate(value: string): string { return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) }
onMounted(async () => {
  const [staff, capabilities] = await Promise.all([getCurrentStaff(), getCapabilities()])
  canManage.value = staff.permissionKeys.includes("refunds.manage") && capabilities.wechatRefundEnabled
  await loadOrders()
})
</script>

<style scoped>
.orders-refund-form { display: grid; gap: var(--space-3); }
.orders-refund-form .orders-field { min-width: 0; }
.orders-refund-form input { min-width: 0; width: 100%; }
.orders-refund-form .orders-button { justify-self: start; }
.orders-confirmation, .orders-refund-record { margin-top: var(--space-4); padding: var(--space-4); border-radius: var(--radius-control); background: var(--surface-elevated); overflow-wrap: anywhere; font-size: var(--font-body-sm); }
.orders-refund-record p, .orders-confirmation p { margin: 0 0 var(--space-3); color: var(--text-secondary); }
.orders-refund-record .orders-error { color: var(--status-error); }
.orders-refund .orders-history-title { margin-top: var(--space-5); }
.orders-line span { min-width: 0; overflow-wrap: anywhere; }
.orders-line input { flex-shrink: 0; }
.orders-page .orders-link:disabled { opacity: .55; cursor: not-allowed; }
</style>
