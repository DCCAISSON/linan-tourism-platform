<template>
  <section class="evaluation-page" aria-labelledby="feedback-title">
    <header class="evaluation-card evaluation-heading">
      <div>
        <p class="evaluation-eyebrow">服务反馈</p>
        <h2 id="feedback-title">服务反馈</h2>
        <p>记录本次行程的服务体验，与学生评价分别保存。</p>
      </div>
      <button type="button" class="evaluation-button" :disabled="loading || exporting || submitting" @click="refresh">刷新</button>
    </header>
    <section class="evaluation-card">
      <div class="feedback-filters">
        <label class="evaluation-field">团期与学校
          <select v-model="sessionId" :disabled="loading || exporting || submitting" @change="load">
            <option value="">请选择团期</option>
            <option v-for="session in sessions" :key="session.id" :value="session.id">{{ session.schoolName }} · {{ session.name }} · {{ session.startsAt.slice(0, 10) }}</option>
          </select>
        </label>
        <label v-if="canRead" class="evaluation-field">来源
          <select v-model="source" :disabled="loading || exporting" @change="load"><option value="">全部来源</option><option value="family">家属</option><option value="school">学校</option></select>
        </label>
        <label v-if="canRead" class="evaluation-field">状态
          <select v-model="status" :disabled="loading || exporting" @change="load"><option value="">全部状态</option><option value="submitted">待审</option><option value="published">公开</option><option value="rejected">驳回</option></select>
        </label>
        <label v-if="canRead" class="evaluation-field">评分
          <select v-model="rating" :disabled="loading || exporting" @change="load"><option value="">全部评分</option><option v-for="score in 5" :key="score" :value="score">{{ score }} 分</option></select>
        </label>
      </div>
      <p v-if="loading" class="evaluation-state" role="status">正在加载反馈…</p>
      <p v-else-if="sessions.length === 0 && !error" class="evaluation-state">暂无可查看的团期。</p>
      <p v-else-if="!sessionId && !error" class="evaluation-state">选择团期后查看反馈。</p>
      <p v-if="error" class="evaluation-error" role="alert">{{ error }}</p>
      <form v-if="canSubmit && sessionId" class="school-feedback-form" @submit.prevent="submitSchool">
        <h3>填写学校服务反馈</h3>
        <p>此反馈仅供内部改进服务，不公开展示，也不作为教育部门最终评价表。</p>
        <fieldset :disabled="submitting || loading">
          <label class="evaluation-field">填写人<input v-model="schoolContactName" required maxlength="80" autocomplete="name"></label>
          <label class="evaluation-field">服务评分<select v-model="schoolRating" required><option value="">请选择</option><option v-for="score in 5" :key="score" :value="score">{{ score }} 分</option></select></label>
          <label class="evaluation-field">意见与建议<textarea v-model="schoolContent" required maxlength="1000" rows="4" /></label>
          <button type="submit" class="evaluation-button">{{ submitting ? '正在提交…' : '提交反馈' }}</button>
        </fieldset>
        <p v-if="schoolMessage" class="evaluation-state" role="status">{{ schoolMessage }}</p>
      </form>
      <template v-if="dashboard && !loading">
        <p class="evaluation-state" role="status">当前筛选 {{ dashboard.summary.totalCount }} 条，公开 {{ dashboard.summary.publicCount }} 条，均分 {{ dashboard.summary.averageRating }}</p>
        <button type="button" class="evaluation-button" :disabled="exporting" @click="download">{{ exporting ? "正在导出…" : "导出 Excel（内部使用，含原反馈）" }}</button>
        <p class="evaluation-state">文件包含当前筛选的汇总和明细，供内部使用。</p>
        <p v-if="dashboard.items.length === 0" class="evaluation-state">当前筛选没有反馈。</p>
        <div class="feedback-list">
          <article v-for="item in dashboard.items" :key="item.id" class="feedback-item">
            <strong>{{ item.source === "family" ? "家属" : "学校" }} / {{ item.rating }}分 / {{ statuses[item.status] }}</strong>
            <p>{{ item.content }}</p>
            <small>{{ item.allowPublic ? "同意公开" : "不同意公开" }}；审核摘要：{{ item.publicExcerpt || "无" }}</small>
          </article>
        </div>
      </template>
    </section>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue"
import { exportFeedback, loadFeedbackDashboard, loadFeedbackSessions, submitSchoolFeedback, type FeedbackDashboard, type FeedbackFilters, type FeedbackItem, type FeedbackSession } from "@/api/feedback"
import { getCurrentStaff } from "@/api/auth"
import { readableRosterError } from "@/api/roster.errors"
import "@/styles/evaluations.css"
import "@/styles/feedback.css"

const sessionId = ref("")
const sessions = ref<readonly FeedbackSession[]>([])
const source = ref<FeedbackItem["source"] | "">("")
const status = ref<FeedbackItem["status"] | "">("")
const rating = ref<number | "">("")
const dashboard = ref<FeedbackDashboard>()
const loading = ref(false)
const exporting = ref(false)
const error = ref("")
const statuses = { submitted: "待审", published: "公开", rejected: "驳回" } as const
const canRead = ref(false)
const canSubmit = ref(false)
const submitting = ref(false)
const schoolContactName = ref("")
const schoolRating = ref<number | "">("")
const schoolContent = ref("")
const schoolMessage = ref("")
let schoolKey = crypto.randomUUID()
let submittedPayload = ""

async function submitSchool(): Promise<void> {
  if (submitting.value || !canSubmit.value || !sessionId.value || schoolRating.value === "") return
  const input = { tourSessionId: sessionId.value, rating: schoolRating.value, content: schoolContent.value.trim().replace(/\s+/g, " "), contactName: schoolContactName.value.trim() }
  if (!input.content || !input.contactName) { error.value = "请填写姓名和意见。"; return }
  const payload = JSON.stringify(input)
  if (payload !== submittedPayload) { schoolKey = crypto.randomUUID(); submittedPayload = payload }
  submitting.value = true; error.value = ""; schoolMessage.value = ""
  try {
    await submitSchoolFeedback({ ...input, idempotencyKey: schoolKey })
    schoolMessage.value = "反馈已提交，谢谢您的建议。"
    schoolContent.value = ""; schoolRating.value = ""; submittedPayload = ""
    if (canRead.value) dashboard.value = await loadFeedbackDashboard(sessionId.value, filters())
  } catch (cause) { error.value = readableRosterError(cause) }
  finally { submitting.value = false }
}

function filters(): FeedbackFilters {
  return { ...(source.value === "" ? {} : { source: source.value }), ...(status.value === "" ? {} : { status: status.value }), ...(rating.value === "" ? {} : { rating: rating.value }) }
}

async function refresh(): Promise<void> {
  loading.value = true
  error.value = ""
  dashboard.value = undefined
  try {
    const staff = await getCurrentStaff()
    canRead.value = staff.permissionKeys.includes("feedback.read")
    canSubmit.value = staff.permissionKeys.includes("feedback.submit") && staff.scopes.some(scope => scope.kind === "school" || scope.kind === "organization")
    sessions.value = await loadFeedbackSessions()
    if (!sessions.value.some(session => session.id === sessionId.value)) sessionId.value = ""
    if (sessionId.value && canRead.value) dashboard.value = await loadFeedbackDashboard(sessionId.value, filters())
  } catch (cause) { error.value = readableRosterError(cause) }
  finally { loading.value = false }
}

async function load(): Promise<void> {
  dashboard.value = undefined
  error.value = ""
  schoolMessage.value = ""
  if (!sessionId.value || !canRead.value) return
  loading.value = true
  try { dashboard.value = await loadFeedbackDashboard(sessionId.value, filters()) }
  catch (cause) { error.value = readableRosterError(cause) }
  finally { loading.value = false }
}

async function download(): Promise<void> {
  exporting.value = true
  error.value = ""
  try {
    const url = URL.createObjectURL(await exportFeedback(sessionId.value, filters()))
    const link = document.createElement("a")
    link.href = url
    link.download = "服务反馈-内部使用.xlsx"
    link.click()
    URL.revokeObjectURL(url)
  } catch (cause) { error.value = readableRosterError(cause) }
  finally { exporting.value = false }
}

onMounted(refresh)
</script>

<style scoped>
.school-feedback-form { margin-top: var(--space-5); }
.school-feedback-form fieldset { display: grid; gap: var(--space-4); margin: 0; padding: 0; border: 0; }
.school-feedback-form textarea { box-sizing: border-box; width: 100%; font: inherit; padding: var(--space-3); border: 1px solid var(--border-default); border-radius: var(--radius-control); }
</style>
