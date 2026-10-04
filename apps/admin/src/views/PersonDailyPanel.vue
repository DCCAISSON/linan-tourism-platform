<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue"
import { getCurrentStaff } from "../api/auth"
import { approvePersonDailySummary, listPersonDailyHistory, listPersonDailyReports, readableExecutionError, savePersonDailyReport, type DailyMealStatus, type GuidePerson, type PersonDailyReport, type PersonDailyRevision, type PersonRef } from "../api/execution"

const props = withDefaults(defineProps<{ sessionId: string; people: readonly GuidePerson[]; startsAt: string; endsAt: string; editable?: boolean }>(), { editable: true })
const reports = ref<readonly PersonDailyReport[]>([])
const personRef = ref<PersonRef | "">("")
const busy = ref(false)
const loaded = ref(false)
const error = ref("")
const notice = ref("")
const canWrite = ref(false)
const canPublish = ref(false)
const canReadHealth = ref(false)
const summary = ref("")
const history = ref<readonly PersonDailyRevision[]>([])
const historyLoaded = ref(false)
const meals = [{ key: "breakfast", note: "breakfastNote", label: "早餐" }, { key: "lunch", note: "lunchNote", label: "午餐" }, { key: "dinner", note: "dinnerNote", label: "晚餐" }] as const
const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" })
const startsOn = computed(() => localDate.format(new Date(props.startsAt)))
const endsOn = computed(() => localDate.format(new Date(props.endsAt)))
const form = reactive<{ reportDate: string; expectedVersion: number; breakfast: DailyMealStatus; lunch: DailyMealStatus; dinner: DailyMealStatus; breakfastNote: string; lunchNote: string; dinnerNote: string; bodyStatus: string; note: string; correctionReason: string }>({ reportDate: startsOn.value, expectedVersion: 0, breakfast: null, lunch: null, dinner: null, breakfastNote: "", lunchNote: "", dinnerNote: "", bodyStatus: "", note: "", correctionReason: "" })
const selectedPerson = computed(() => props.people.find((person) => person.personRef === personRef.value))
const selectedReport = computed(() => reports.value.find((report) => report.personRef === personRef.value && report.reportDate === form.reportDate))
const healthReadable = computed(() => canReadHealth.value && selectedPerson.value?.healthAuthorized === true && (selectedReport.value?.healthReadable ?? true))

function populate(): void {
  const report = selectedReport.value
  form.expectedVersion = report?.version ?? 0
  for (const meal of meals) { form[meal.key] = report?.[meal.key] ?? null; form[meal.note] = report?.[meal.note] ?? "" }
  form.correctionReason = ""
  history.value = []
  historyLoaded.value = false
  form.bodyStatus = report?.bodyStatus ?? ""
  form.note = report?.note ?? ""
  summary.value = report?.publicSummary ?? ""
}
watch([personRef, () => form.reportDate], populate)

async function loadHistory(): Promise<void> {
  const report = selectedReport.value
  if (report === undefined) return
  busy.value = true
  error.value = ""
  try { history.value = await listPersonDailyHistory(props.sessionId, report.id); historyLoaded.value = true }
  catch (cause) { error.value = readableExecutionError(cause) }
  finally { busy.value = false }
}
function mealLabel(value: DailyMealStatus): string { return value === "recorded" ? "已记录" : value === "not_applicable" ? "不适用" : "未记录" }

async function load(): Promise<void> {
  busy.value = true
  error.value = ""
  try {
    const [rows, staff] = await Promise.all([listPersonDailyReports(props.sessionId), getCurrentStaff()])
    reports.value = rows
    canWrite.value = props.editable && staff.permissionKeys.includes("execution.write")
    canPublish.value = staff.permissionKeys.includes("execution.publish")
    canReadHealth.value = staff.permissionKeys.includes("health.read")
    loaded.value = true
    populate()
  } catch (cause) { error.value = readableExecutionError(cause) }
  finally { busy.value = false }
}

async function save(): Promise<void> {
  if (personRef.value === "" || !props.editable || !selectedPerson.value?.active) return
  busy.value = true
  error.value = ""
  notice.value = ""
  try {
    await savePersonDailyReport(props.sessionId, personRef.value, { ...form })
    await load()
    notice.value = "个人日报已保存，公开摘要待审批。"
  } catch (cause) { error.value = readableExecutionError(cause) }
  finally { busy.value = false }
}

async function publish(): Promise<void> {
  const report = selectedReport.value
  if (report === undefined) return
  busy.value = true
  error.value = ""
  notice.value = ""
  try { await approvePersonDailySummary(props.sessionId, report, summary.value); await load(); notice.value = "公开摘要已批准。" }
  catch (cause) { error.value = readableExecutionError(cause) }
  finally { busy.value = false }
}

onMounted(() => { void load() })
</script>

<template>
  <section class="person-daily">
    <h2>逐人每日记录</h2>
    <el-alert v-if="error" type="error" :title="error" :closable="false" show-icon />
    <el-alert v-if="notice" type="success" :title="notice" :closable="false" />
    <el-button :loading="busy" @click="load">刷新个人日报</el-button>
    <p v-if="!loaded && busy">正在读取日报…</p>
    <p v-if="loaded && reports.length === 0">尚无个人日报，请选择人员和日期填写。</p>
    <el-form label-position="top" @submit.prevent="save">
      <el-form-item label="记录人员"><el-select v-model="personRef" placeholder="请选择人员" :disabled="busy"><el-option v-for="person in people" :key="person.personRef" :label="person.displayName" :value="person.personRef" /></el-select></el-form-item>
      <el-form-item label="记录日期"><el-input v-model="form.reportDate" type="date" :min="startsOn" :max="endsOn" :disabled="busy" /></el-form-item>
      <p v-if="personRef">{{ selectedReport ? '已有记录' : '当日尚无记录' }} · {{ selectedReport?.publicApproved ? '摘要已批准' : '摘要未批准' }}</p>
      <p v-if="selectedReport?.lodgingCheck">历史住宿综合记录：{{ selectedReport.lodgingCheck }}</p>
      <p v-if="selectedReport?.mealStatus">历史餐饮综合记录：{{ selectedReport.mealStatus }}</p>
      <p>三餐分别记录；“未记录”不表示未用餐。此处汇总当天情况；计划内的餐次和查房请在执行节点中记录。</p>
      <div v-for="meal in meals" :key="meal.key" class="daily-meal">
        <label :for="`daily-${meal.key}`">{{ meal.label }}</label>
        <select :id="`daily-${meal.key}`" v-model="form[meal.key]" :disabled="busy || !canWrite">
          <option :value="null">未记录</option><option value="recorded">已记录</option><option value="not_applicable">不适用</option>
        </select>
        <el-form-item :label="`${meal.label}情况或理由`"><el-input v-model="form[meal.note]" type="textarea" :disabled="busy || !canWrite" maxlength="4000" /></el-form-item>
      </div>
      <el-form-item label="身体情况"><el-input v-model="form.bodyStatus" type="textarea" :disabled="busy || !canWrite || !healthReadable" maxlength="4000" /></el-form-item>
      <el-form-item label="私人备注"><el-input v-model="form.note" type="textarea" :disabled="busy || !canWrite || !healthReadable" maxlength="4000" /></el-form-item>
      <p v-if="!healthReadable">身体情况与私人备注需健康读取权限及有效家属授权。保存住宿、餐饮记录会保留已有私密内容。</p>
      <el-form-item v-if="selectedReport" label="更正原因"><el-input v-model="form.correctionReason" :disabled="busy || !canWrite" maxlength="1000" /></el-form-item>
      <el-button type="primary" :loading="busy" :disabled="!loaded || !canWrite || !personRef || !selectedPerson?.active || (!!selectedReport && !form.correctionReason.trim())" @click="save">保存个人日报</el-button>
      <el-button v-if="selectedReport" :loading="busy" @click="loadHistory">查看日报历史</el-button>
      <template v-if="canPublish && selectedReport">
        <el-form-item label="给本订单家属的公开摘要"><el-input v-model="summary" type="textarea" maxlength="1000" :disabled="busy" /></el-form-item>
        <el-button :loading="busy" :disabled="!summary.trim()" @click="publish">批准公开摘要</el-button>
      </template>
    </el-form>
    <div v-if="historyLoaded" class="daily-history">
      <h3>日报历史</h3>
      <p v-if="history.length === 0">历史版本尚未生成，首次更正时会保留原记录。</p>
      <article v-for="revision in history" :key="revision.id">
        <h4>版本 {{ revision.version }} · {{ revision.correctionReason }}</h4>
        <p>{{ new Date(revision.createdAt).toLocaleString('zh-CN') }} · 记录人：{{ revision.recordedByName }}</p>
        <p v-for="meal in meals" :key="meal.key">{{ meal.label }}：{{ mealLabel(revision[meal.key]) }}{{ revision[meal.note] ? ` · ${revision[meal.note]}` : '' }}</p>
        <p v-if="revision.lodgingCheck">历史住宿综合记录：{{ revision.lodgingCheck }}</p>
        <p v-if="revision.mealStatus">历史餐饮综合记录：{{ revision.mealStatus }}</p>
      </article>
    </div>
  </section>
</template>

<style scoped>
.person-daily { padding: var(--space-5); margin-bottom: var(--space-4); border-radius: var(--radius-card); background: var(--surface-elevated); color: var(--text-primary); }
.person-daily h2 { font-size: var(--font-h2); }
.person-daily p { color: var(--text-secondary); line-height: 1.6; }
.person-daily .el-form { margin-top: var(--space-4); }
.daily-meal select { display: block; width: 100%; min-height: var(--size-touch-target); margin: var(--space-2) 0; padding: var(--space-2); color: var(--text-primary); background: var(--surface-elevated); border: 1px solid var(--border-default); border-radius: var(--radius-control); font: inherit; }
.daily-history article { margin-top: var(--space-3); padding: var(--space-3); background: var(--surface-secondary); border-radius: var(--radius-control); overflow-wrap: anywhere; }
@media (max-width: 768px) {
  .el-button { min-height: var(--size-touch-target); min-width: var(--size-touch-target); padding: var(--space-2) var(--space-3); }
  :deep(.el-input__wrapper), :deep(.el-select__wrapper) { min-height: var(--size-touch-target); box-sizing: border-box; }
}
</style>
