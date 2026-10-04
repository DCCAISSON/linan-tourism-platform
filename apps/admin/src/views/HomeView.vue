<template>
  <section class="workbench" aria-labelledby="home-title" :aria-busy="loading">
    <header class="workbench-heading">
      <div><h2 id="home-title">工作台</h2><p>查看待处理事项、近期团期和当前报名数据。</p></div>
      <button type="button" :disabled="loading || tasksLoading" @click="load">{{ loading || tasksLoading ? "刷新中..." : "刷新数据" }}</button>
    </header>
    <section v-if="canReadRefunds || canReadChanges || taskAccessError" class="workbench-card" aria-labelledby="tasks-title">
      <h3 id="tasks-title">待处理事项</h3>
      <p class="workbench-caption">包含此前提交的申请；审核通过不代表实际办理完成，请结合处理记录核实。</p>
      <p v-if="taskAccessError" class="workbench-state workbench-state--error" role="alert">待处理事项暂时无法读取，请刷新重试。</p>
      <ul class="workbench-tasks">
        <li v-if="canReadRefunds" data-testid="task-refunds">
          <span>退款待审核</span>
          <span v-if="refundLoading" role="status">读取中…</span>
          <span v-else-if="refundError" class="workbench-task-error" role="alert">暂时无法读取 <button type="button" @click="loadRefundTasks">重试</button></span>
          <strong v-else-if="refundCount !== undefined">{{ refundCount }} 项</strong>
          <router-link to="/refund-applications">查看退款申请</router-link>
        </li>
        <li v-if="canReadChanges" data-testid="task-changes-review">
          <span>人员变更待审核</span>
          <span v-if="changesLoading" role="status">读取中…</span>
          <span v-else-if="changesError" class="workbench-task-error" role="alert">暂时无法读取 <button type="button" @click="loadChangeTasks">重试</button></span>
          <strong v-else-if="changeReviewCount !== undefined">{{ changeReviewCount }} 项</strong>
          <router-link to="/order-changes">查看人员变更</router-link>
        </li>
        <li v-if="canReadChanges && changeApprovedCount !== undefined" data-testid="task-changes-approved">
          <span>人员变更已通过</span><strong>{{ changeApprovedCount }} 项</strong>
          <router-link to="/order-changes">查看处理记录</router-link>
        </li>
      </ul>
    </section>
    <p v-if="loading" class="workbench-state" role="status">正在加载工作台...</p>
    <p v-else-if="error" class="workbench-state workbench-state--error" role="alert">{{ error }}，请刷新重试。</p>
    <template v-else-if="summary">
      <div class="workbench-stats" aria-label="业务统计">
        <article class="workbench-stat"><span>启用活动</span><strong>{{ summary.activeActivityCount }} 个</strong><small>当前启用的课程</small></article>
        <article class="workbench-stat workbench-stat--green"><span>近期团期</span><strong>{{ summary.upcomingSessionCount }} 个</strong><small>未来30天已发布团期</small></article>
        <article class="workbench-stat"><span>当前已付款报名人数</span><strong data-testid="workbench-paid-headcount">{{ summary.paidHeadcount }} 人</strong><small>已付款且名单未取消的参加人员</small></article>
        <article class="workbench-stat workbench-stat--money"><span>当前已付款报名金额</span><strong data-testid="workbench-paid-amount">{{ formatFen(summary.paidAmountFen) }}</strong><small>当前未取消名单对应的原报名费用</small></article>
      </div>
      <p class="workbench-caption">统计更新：{{ dateTime(summary.generatedAt) }}。人数与金额覆盖全部团期，不限于未来30天；取消名单不计入，金额不代表累计支付或资金流水。</p>
      <section class="workbench-card" aria-labelledby="upcoming-title">
        <div class="workbench-card-heading"><h3 id="upcoming-title">近期出发团期</h3><span>{{ summary.upcomingSessionCount }} 个</span></div>
        <p class="workbench-caption">范围：{{ dateTime(summary.upcomingFrom) }} 至 {{ dateTime(summary.upcomingUntil) }}，以服务器时间起算30天。</p>
        <p v-if="summary.upcomingSessions.length === 0" class="workbench-state">未来30天暂无已发布团期。</p>
        <div v-else class="workbench-table-wrap">
          <table class="workbench-table" aria-label="近期团期">
            <thead><tr><th scope="col">活动与团期</th><th scope="col">学校</th><th scope="col">出发日期</th><th scope="col">学校价格</th><th scope="col">人数上限</th><th scope="col">操作</th></tr></thead>
            <tbody><tr v-for="session in summary.upcomingSessions" :key="session.id">
              <td data-label="活动与团期"><strong>{{ session.activityTitle }}</strong><span>{{ session.code }}</span></td>
              <td data-label="学校">{{ session.schoolName }}</td><td data-label="出发日期">{{ dateTime(session.startsAt) }}</td>
              <td data-label="学校价格" class="workbench-price">{{ formatFen(session.priceFen) }}/人</td><td data-label="人数上限">{{ session.capacity }} 人</td>
              <td data-label="操作"><router-link :to="{ path: '/roster', query: { tourSessionId: session.id } }">查看名单</router-link></td>
            </tr></tbody>
          </table>
        </div>
      </section>
    </template>
    <section class="workbench-card" aria-labelledby="quick-title">
      <h3 id="quick-title">常用操作</h3>
      <div class="workbench-shortcuts">
        <router-link to="/configuration"><strong>管理学校、课程与团期</strong><span>维护活动内容、日期和学校价格</span></router-link>
        <router-link to="/roster"><strong>查询名单与导出 Excel</strong><span>按团期、学校、年级和班级查询</span></router-link>
        <router-link to="/orders"><strong>查看订单与退款</strong><span>核对参加人员、历史金额和退款处理记录</span></router-link>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { getCurrentStaff } from "@/api/auth"
import { getCapabilities } from "@/api/capabilities"
import { listRefundApplications } from "@/api/refund-applications"
import { listOrderChanges } from "@/api/order-changes"
import { readableRosterError } from "@/api/roster"
import { getWorkbenchSummary } from "@/api/workbench"
import type { WorkbenchSummary } from "@/api/workbench"
import { formatFen } from "@/views/roster/format"
import "@/styles/workbench.css"
const summary = ref<WorkbenchSummary>()
const loading = ref(false)
const error = ref("")
const canReadRefunds = ref(false)
const canReadChanges = ref(false)
const taskAccessLoading = ref(false)
const taskAccessError = ref(false)
const refundLoading = ref(false)
const changesLoading = ref(false)
const refundError = ref(false)
const changesError = ref(false)
const refundCount = ref<number>()
const changeReviewCount = ref<number>()
const changeApprovedCount = ref<number>()
const tasksLoading = computed(() => taskAccessLoading.value || refundLoading.value || changesLoading.value)
async function load(): Promise<void> {
  await Promise.all([loadSummary(), loadTasks()])
}
async function loadSummary(): Promise<void> {
  loading.value = true
  error.value = ""
  summary.value = undefined
  try { summary.value = await getWorkbenchSummary() }
  catch (caught) { error.value = caught instanceof SyntaxError ? "工作台响应格式不正确" : readableRosterError(caught) }
  finally { loading.value = false }
}
async function loadTasks(): Promise<void> {
  taskAccessLoading.value = true
  taskAccessError.value = false
  canReadRefunds.value = false; canReadChanges.value = false
  refundCount.value = undefined; changeReviewCount.value = undefined; changeApprovedCount.value = undefined
  try {
    const [staff, capabilities] = await Promise.all([getCurrentStaff(), getCapabilities()])
    const allScope = staff.scopes.some(scope => scope.kind === "all")
    canReadRefunds.value = allScope && (staff.permissionKeys.includes("refunds.review") || (staff.permissionKeys.includes("refunds.execute") && capabilities.wechatRefundEnabled))
    canReadChanges.value = allScope && staff.permissionKeys.includes("orders.read")
    await Promise.all([...(canReadRefunds.value ? [loadRefundTasks()] : []), ...(canReadChanges.value ? [loadChangeTasks()] : [])])
  } catch (caught) { if (caught instanceof Error) taskAccessError.value = true; else throw caught }
  finally { taskAccessLoading.value = false }
}
async function loadRefundTasks(): Promise<void> {
  if (!canReadRefunds.value || refundLoading.value) return
  refundLoading.value = true; refundError.value = false; refundCount.value = undefined
  try { refundCount.value = (await listRefundApplications("submitted")).length }
  catch (caught) { if (caught instanceof Error) refundError.value = true; else throw caught }
  finally { refundLoading.value = false }
}
async function loadChangeTasks(): Promise<void> {
  if (!canReadChanges.value || changesLoading.value) return
  changesLoading.value = true; changesError.value = false
  changeReviewCount.value = undefined; changeApprovedCount.value = undefined
  try {
    const rows = await listOrderChanges()
    changeReviewCount.value = rows.filter(row => row.status === "submitted").length
    changeApprovedCount.value = rows.filter(row => row.status === "approved").length
  } catch (caught) { if (caught instanceof Error) changesError.value = true; else throw caught }
  finally { changesLoading.value = false }
}
function dateTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })
}
onMounted(load)
</script>
