<script setup lang="ts">
import { onMounted, ref, watch } from "vue"
import { useSessionQuery } from "@/layouts/useSessionQuery"
import { getCurrentStaff } from "../api/auth"
import { approvePersonDailySummary, downloadExecutionRecords, getExecutionManagementSession, listExecutionManagementSessions, listPersonDailyHistory, readableExecutionError, type DailyMealStatus, type ExecutionManagementSession, type GuideSessionSummary, type ManagementPersonDaily, type PersonDailyRevision } from "../api/execution"
import GuideAssignmentPanel from "./GuideAssignmentPanel.vue"
import ExecutionNodesPanel from "./ExecutionNodesPanel.vue"

const sessions = ref<readonly GuideSessionSummary[]>([])
const sessionId = ref("")
const sessionQuery = useSessionQuery(sessionId, id => sessions.value.some(row => row.id === id), () => busy.value || downloading.value)
const session = ref<ExecutionManagementSession | null>(null)
const busy = ref(false)
const downloading = ref(false)
const canManage = ref(false)
const canPublish = ref(false)
const error = ref("")
const notice = ref("")
const summaries = ref<Record<string, string>>({})
const dailyHistory = ref<Record<string, readonly PersonDailyRevision[]>>({})
const meals = [{ key: "breakfast", note: "breakfastNote", label: "早餐" }, { key: "lunch", note: "lunchNote", label: "午餐" }, { key: "dinner", note: "dinnerNote", label: "晚餐" }] as const
function mealLabel(value: DailyMealStatus): string { return value === "recorded" ? "已记录" : value === "not_applicable" ? "不适用" : "未记录" }
const attendanceLabels = { present: "已到", absent: "未到", revoked: "已撤销" } as const
const categoryLabels = { objective: "客观事项", health: "健康事项", safety: "安全事项", other: "其他事项" } as const

async function initialize(): Promise<void> {
  busy.value = true
  error.value = ""
  try {
    const staff = await getCurrentStaff()
    canManage.value = staff.permissionKeys.includes("execution.read") && staff.permissionKeys.includes("execution.manage")
    canPublish.value = staff.permissionKeys.includes("execution.publish")
    if (!canManage.value) { error.value = "无权查看执行管理，请联系管理员。"; return }
    sessions.value = await listExecutionManagementSessions()
    sessionQuery.initialize()
  } catch (cause) { error.value = readableExecutionError(cause) }
  finally { busy.value = false }
}
async function loadSession(): Promise<void> {
  if (!sessionId.value || !canManage.value) return
  const id = sessionId.value
  const revision = sessionQuery.revision.value
  busy.value = true
  error.value = ""
  session.value = null
  try {
    const loaded = await getExecutionManagementSession(id)
    if (revision !== sessionQuery.revision.value) return
    session.value = loaded
    summaries.value = Object.fromEntries(loaded.personDailyReports.map(report => [report.id, report.publicSummary]))
  } catch (cause) { if (revision === sessionQuery.revision.value) error.value = readableExecutionError(cause) }
  finally { busy.value = false }
}
async function approve(report: ManagementPersonDaily): Promise<void> {
  const summary = summaries.value[report.id]?.trim() ?? ""
  if (!canPublish.value || !summary) return
  busy.value = true
  error.value = ""
  notice.value = ""
  try { await approvePersonDailySummary(sessionId.value, report, summary); await loadSession(); notice.value = "个人公开摘要已批准。" }
  catch (cause) { error.value = readableExecutionError(cause) }
  finally { busy.value = false }
}
async function download(): Promise<void> {
  downloading.value = true
  error.value = ""
  try { await downloadExecutionRecords(sessionId.value) }
  catch (cause) { error.value = readableExecutionError(cause) }
  finally { downloading.value = false }
}
async function loadHistory(reportId: string): Promise<void> {
  busy.value = true; error.value = ""
  try { dailyHistory.value[reportId] = await listPersonDailyHistory(sessionId.value, reportId) }
  catch (cause) { error.value = readableExecutionError(cause) }
  finally { busy.value = false }
}
watch(sessionId, () => { session.value = null; summaries.value = {}; dailyHistory.value = {}; notice.value = ""; error.value = "" }, { flush: "sync" })
onMounted(() => { void initialize() })
</script>

<template>
  <main class="execution-management">
    <header><p class="eyebrow">运营管理</p><h1>执行管理</h1><p>指派导游，查看当前点名、住宿餐饮记录并审核个人公开摘要。</p></header>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <p v-if="notice" role="status" class="success">{{ notice }}</p>
    <form v-if="canManage" class="panel selection" @submit.prevent="loadSession">
      <label>执行团期<select v-model="sessionId" :disabled="busy" required><option value="">请选择团期</option><option v-for="item in sessions" :key="item.id" :value="item.id">{{ item.code }}</option></select></label>
      <button type="submit" :disabled="busy || !sessionId">{{ busy ? '读取中…' : '读取执行记录' }}</button>
      <button type="button" class="secondary" :disabled="!session || downloading || busy" @click="download">{{ downloading ? '导出中…' : '导出执行记录' }}</button>
      <p class="full">导出包含当前点名、个人每日记录、节点计划、发生与更正历史、团队摘要、事件摘要及计数。</p>
    </form>
    <p v-if="!busy && canManage && sessions.length === 0">管理范围内暂无团期。</p>
    <template v-if="session">
      <section class="panel" aria-label="当前安排状态">
        <h2>{{ session.code }}</h2>
        <p v-if="session.confirmationStatus === 'current'" class="success">人车安排已确认。</p>
        <p v-else class="warning">安排待确认：{{ session.confirmationStatus === 'stale' ? '人车安排已调整，请重新确认。' : '尚未确认人车安排。' }} 下方可查看已保存的执行记录。</p>
      </section>
      <GuideAssignmentPanel :key="session.id" :session-id="session.id" :vehicles="session.vehicles" />
      <ExecutionNodesPanel :key="session.id" :session-id="session.id" :people="session.people" :starts-at="session.startsAt" :ends-at="session.endsAt" :manageable="canManage" :editable="false" />
      <section v-if="session.confirmationStatus === 'current'" class="panel" aria-labelledby="attendance-title">
        <h2 id="attendance-title">当前点名</h2>
        <p>旧版综合点名；逐节点状态见执行节点。</p>
        <p>已到 {{ session.counts.present }} 人 · 未到 {{ session.counts.absent }} 人 · 已撤销 {{ session.counts.revoked }} 人 · 未点名 {{ session.counts.unrecorded }} 人</p>
        <ul class="records">
          <li v-for="person in session.people" :key="person.personRef">
            <strong>{{ person.displayName }}</strong><p>{{ person.gradeName ?? '' }}{{ person.className ?? '未分班' }} · {{ person.vehicleSequence === null ? '车辆待补' : `${person.vehicleSequence}号车` }} · {{ person.attendance ? attendanceLabels[person.attendance.status] : '未点名' }}</p>
            <p v-if="person.attendance">信息{{ person.attendance.infoChecked ? '已核对' : '未核对' }} · {{ person.attendance.groupJoined ? '已入群' : '未入群' }}</p>
          </li>
        </ul>
        <p v-if="session.people.length === 0">暂无已确认人员。</p>
      </section>
      <section class="panel" aria-labelledby="personal-records-title">
        <h2 id="personal-records-title">个人每日记录与摘要审核</h2>
        <p>共 {{ session.counts.personDailyReports }} 条，{{ session.counts.approvedPersonDailyReports }} 条摘要已批准。</p>
        <ul class="records">
          <li v-for="report in session.personDailyReports" :key="report.id">
            <h3>{{ report.displayName }} · {{ report.reportDate }}</h3>
            <p v-if="report.lodgingCheck">历史住宿综合记录：{{ report.lodgingCheck }}</p><p v-if="report.mealStatus">历史餐饮综合记录：{{ report.mealStatus }}</p>
            <p v-for="meal in meals" :key="meal.key">{{ meal.label }}：{{ mealLabel(report[meal.key]) }}{{ report[meal.note] ? ` · ${report[meal.note]}` : '' }}</p>
            <button type="button" :disabled="busy" @click="loadHistory(report.id)">查看 {{ report.displayName }} 的日报历史</button>
            <div v-if="dailyHistory[report.id]" class="daily-history">
              <p v-if="dailyHistory[report.id]?.length === 0">历史版本尚未生成。</p>
              <article v-for="revision in dailyHistory[report.id]" :key="revision.id">
                <h3>版本 {{ revision.version }} · {{ revision.correctionReason }}</h3>
                <p>{{ new Date(revision.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) }} · 记录人：{{ revision.recordedByName || '工作人员' }}</p>
                <p v-for="meal in meals" :key="meal.key">{{ meal.label }}：{{ mealLabel(revision[meal.key]) }}{{ revision[meal.note] ? ` · ${revision[meal.note]}` : '' }}</p>
                <p v-if="revision.lodgingCheck">历史住宿综合记录：{{ revision.lodgingCheck }}</p><p v-if="revision.mealStatus">历史餐饮综合记录：{{ revision.mealStatus }}</p>
              </article>
            </div>
            <p>{{ report.publicApproved ? '摘要已批准' : '摘要待审核' }}</p>
            <form v-if="canPublish" @submit.prevent="approve(report)">
              <label>公开摘要（{{ report.displayName }} {{ report.reportDate }}）<textarea v-model="summaries[report.id]" :disabled="busy" maxlength="1000" rows="3" required /></label>
              <button type="submit" :disabled="busy || !summaries[report.id]?.trim()">批准公开摘要</button>
            </form>
            <p v-else-if="report.publicApproved">{{ report.publicSummary }}</p>
          </li>
        </ul>
        <p v-if="session.personDailyReports.length === 0">尚无个人每日记录。</p>
      </section>
      <section class="panel" aria-labelledby="team-records-title">
        <h2 id="team-records-title">团队每日记录</h2>
        <ul class="records"><li v-for="report in session.dailyReports" :key="report.id"><h3>{{ report.reportDate }}</h3><p>住宿：{{ report.lodgingCheck }}</p><p>餐饮：{{ report.mealStatus }}</p><p>{{ report.publicApproved ? report.publicSummary : '暂无已批准摘要' }}</p></li></ul>
        <p v-if="session.dailyReports.length === 0">尚无团队每日记录。</p>
      </section>
      <section class="panel" aria-labelledby="event-records-title">
        <h2 id="event-records-title">事件摘要</h2>
        <p>共 {{ session.counts.events }} 条事项。</p>
        <ul class="records"><li v-for="event in session.events" :key="event.id"><h3>{{ categoryLabels[event.category] }}</h3><p>{{ new Date(event.occurredAt).toLocaleString('zh-CN', { hour12: false }) }}</p><p>{{ event.publicApproved ? event.publicSummary : '暂无已批准摘要' }}</p></li></ul>
      </section>
    </template>
  </main>
</template>

<style scoped>
.execution-management { min-width: 0; display: grid; gap: var(--space-4); color: var(--text-primary); }
h1, h2, h3, p { margin: 0; overflow-wrap: anywhere; } h1 { font-size: var(--font-h1); } h2 { font-size: var(--font-h2); } h3 { font-size: var(--font-h3); }
header, .panel { display: grid; gap: var(--space-3); min-width: 0; padding: var(--space-5); background: var(--surface-elevated); border-radius: var(--radius-card); }
p { color: var(--text-secondary); line-height: 1.6; } .eyebrow { color: var(--accent-primary); } .error { color: var(--status-error); } .success { color: var(--status-success); } .warning { color: var(--status-warning); }
.selection { grid-template-columns: minmax(0, 1fr) auto auto; align-items: end; } .full { grid-column: 1 / -1; }
label { display: grid; gap: var(--space-2); min-width: 0; } form { display: grid; gap: var(--space-3); }
select, textarea, button { box-sizing: border-box; min-width: 0; max-width: 100%; min-height: var(--size-touch-target); padding: var(--space-2) var(--space-3); font: inherit; border: 1px solid var(--border-default); border-radius: var(--radius-control); }
select, textarea { width: 100%; color: var(--text-primary); background: var(--surface-primary); }
button { cursor: pointer; color: var(--on-accent); background: var(--accent-primary); } button.secondary { background: var(--surface-elevated); color: var(--accent-primary); } button:disabled { cursor: not-allowed; opacity: .6; }
.records { display: grid; gap: var(--space-3); list-style: none; padding: 0; margin: 0; }
.records li { display: grid; gap: var(--space-2); min-width: 0; padding: var(--space-4); background: var(--surface-secondary); border-radius: var(--radius-control); }
.daily-history { display: grid; gap: var(--space-3); } .daily-history article { display: grid; gap: var(--space-2); padding: var(--space-3); background: var(--surface-elevated); border-radius: var(--radius-control); }
@media (max-width: 768px) { .selection { grid-template-columns: 1fr; } }
</style>
