<template>
  <section class="orders-page" aria-labelledby="orders-title">
    <header class="orders-card orders-heading">
      <div>
        <p class="orders-eyebrow">业务订单</p>
        <h2 id="orders-title">订单管理</h2>
        <p>核对报名人员、付款状态与历史费用。退款操作仅作本地流程验证。</p>
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
              <td data-label="操作"><button type="button" class="orders-link" @click="openDetail(order.id)">查看详情</button></td>
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
      <div class="orders-section-heading"><h3 id="order-detail-title">订单详情</h3><button type="button" class="orders-link" @click="closeDetail">关闭详情</button></div>
      <p v-if="detailLoading" class="orders-state" role="status">正在加载订单详情...</p>
      <p v-if="detailError" class="orders-error" role="alert">{{ detailError }} <button type="button" @click="openDetail(selectedId)">重试</button></p>
      <template v-if="detail">
        <dl class="orders-facts">
          <div><dt>订单号</dt><dd>{{ detail.code }}</dd></div><div><dt>活动</dt><dd>{{ detail.activityTitle }}</dd></div>
          <div><dt>学校</dt><dd>{{ detail.schoolName }}</dd></div><div><dt>付款状态</dt><dd>{{ statusText(detail.status) }}</dd></div>
          <div><dt>联系人</dt><dd>{{ detail.contactName }}</dd></div><div><dt>应付 / 已付</dt><dd>{{ formatFen(detail.amountFen) }} / {{ formatFen(detail.paidFen) }}</dd></div>
        </dl>
        <div class="orders-section-heading"><h3>参加人员</h3><span>{{ detail.participants.length }} 人</span></div>
        <div class="orders-lines">
          <label v-for="line in detail.participants" :key="line.id" class="orders-line">
            <input v-model="selectedLineIds" type="checkbox" :value="line.id" :disabled="detail.status !== 'paid' || refundBusy" :aria-label="`选择取消 ${line.displayName}`" @change="clearQuote" />
            <span><strong>{{ line.displayName }}</strong><small>{{ line.gradeName ?? "未设置年级" }} · {{ line.className ?? "未设置班级" }}</small></span>
            <b class="orders-money">{{ formatFen(line.amountFen) }}</b>
          </label>
        </div>
        <div class="orders-refund">
          <h3>按人员试算退款</h3>
          <p>仅选中拟取消人员并计算金额。当前不发起真实退款，也不改变订单、名单或名额。</p>
          <p v-if="detail.status !== 'paid'" class="orders-state">只有已支付订单可进行退款试算。</p>
          <div class="orders-refund-actions">
            <button type="button" class="orders-button" :disabled="detail.status !== 'paid' || selectedLineIds.length === 0 || refundBusy" @click="preview">{{ refundBusy ? "处理中..." : "计算退款金额" }}</button>
            <button type="button" class="orders-button orders-button--secondary" :disabled="!quote || refundBusy" @click="simulate('succeeded')">模拟成功</button>
            <button type="button" class="orders-button orders-button--secondary" :disabled="!quote || refundBusy" @click="simulate('failed')">模拟失败</button>
          </div>
          <p v-if="refundError" class="orders-error" role="alert">{{ refundError }}</p>
          <p v-if="quote" class="orders-quote">试算退款：{{ formatFen(quote.amountFen) }} <small>选中 {{ quote.participantCount }} 人，不按提前天数扣费</small></p>
          <p v-if="simulation" class="orders-state" role="status">{{ simulation === "succeeded" ? "本地模拟成功，未实际退款" : "本地模拟失败，未实际退款" }}</p>
        </div>
      </template>
    </section>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue"
import { getStaffOrder, listStaffOrders, refundPreview, simulateRefund } from "@/api/orders"
import type { RefundPreview, StaffOrder, StaffOrderDetail, StaffOrderList } from "@/api/orders"
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
const quote = ref<RefundPreview>()
const simulation = ref<"succeeded" | "failed">()
const refundBusy = ref(false)
const refundError = ref("")

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
  clearQuote()
  detailLoading.value = true
  try { detail.value = await getStaffOrder(id) }
  catch (error) { detailError.value = readableRosterError(error) }
  finally { detailLoading.value = false }
}
function closeDetail(): void { selectedId.value = ""; detail.value = undefined; selectedLineIds.value = []; clearQuote() }
function clearQuote(): void { quote.value = undefined; simulation.value = undefined; refundError.value = "" }
async function preview(): Promise<void> {
  if (!detail.value || selectedLineIds.value.length === 0) return
  refundBusy.value = true
  clearQuote()
  try { quote.value = await refundPreview(detail.value.id, selectedLineIds.value) }
  catch (error) { refundError.value = readableRosterError(error) }
  finally { refundBusy.value = false }
}
async function simulate(outcome: "succeeded" | "failed"): Promise<void> {
  if (!detail.value || !quote.value) return
  refundBusy.value = true
  refundError.value = ""
  simulation.value = undefined
  try {
    const result = await simulateRefund(detail.value.id, selectedLineIds.value, outcome)
    quote.value = result
    simulation.value = outcome
  } catch (error) { refundError.value = readableRosterError(error) }
  finally { refundBusy.value = false }
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
onMounted(loadOrders)
</script>
