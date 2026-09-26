<template>
  <section class="workbench" aria-labelledby="home-title" :aria-busy="loading">
    <header class="workbench-heading">
      <div><h2 id="home-title">工作台</h2><p>查看活动、近期团期和累计已付款数据。</p></div>
      <button type="button" :disabled="loading" @click="load">{{ loading ? "刷新中..." : "刷新数据" }}</button>
    </header>
    <p v-if="loading" class="workbench-state" role="status">正在加载工作台...</p>
    <p v-else-if="error" class="workbench-state workbench-state--error" role="alert">{{ error }}，请刷新重试。</p>
    <template v-else-if="summary">
      <div class="workbench-stats" aria-label="业务统计">
        <article class="workbench-stat"><span>启用活动</span><strong>{{ summary.activeActivityCount }} 个</strong><small>当前启用的课程</small></article>
        <article class="workbench-stat workbench-stat--green"><span>近期团期</span><strong>{{ summary.upcomingSessionCount }} 个</strong><small>未来30天已发布团期</small></article>
        <article class="workbench-stat"><span>累计已付款人数</span><strong data-testid="workbench-paid-headcount">{{ summary.paidHeadcount }} 人</strong><small>进入已付款名单的参加人员</small></article>
        <article class="workbench-stat workbench-stat--money"><span>累计已付款金额</span><strong data-testid="workbench-paid-amount">{{ formatFen(summary.paidAmountFen) }}</strong><small>成功付款对应的人员费用</small></article>
      </div>
      <p class="workbench-caption">统计更新：{{ dateTime(summary.generatedAt) }}。退款登记不改变已付款统计。</p>
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
import { onMounted, ref } from "vue"
import { readableRosterError } from "@/api/roster"
import { getWorkbenchSummary } from "@/api/workbench"
import type { WorkbenchSummary } from "@/api/workbench"
import { formatFen } from "@/views/roster/format"
import "@/styles/workbench.css"
const summary = ref<WorkbenchSummary>()
const loading = ref(false)
const error = ref("")
async function load(): Promise<void> {
  loading.value = true
  error.value = ""
  summary.value = undefined
  try { summary.value = await getWorkbenchSummary() }
  catch (caught) { error.value = caught instanceof SyntaxError ? "工作台响应格式不正确" : readableRosterError(caught) }
  finally { loading.value = false }
}
function dateTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })
}
onMounted(load)
</script>
