<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue"
import { getCurrentStaff } from "../api/auth"
import { approvePersonDailySummary, listPersonDailyReports, readableExecutionError, savePersonDailyReport, type GuidePerson, type PersonDailyReport, type PersonRef } from "../api/execution"

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
const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" })
const startsOn = computed(() => localDate.format(new Date(props.startsAt)))
const endsOn = computed(() => localDate.format(new Date(props.endsAt)))
const form = reactive({ reportDate: startsOn.value, expectedVersion: 0, lodgingCheck: "", mealStatus: "", bodyStatus: "", note: "" })
const selectedPerson = computed(() => props.people.find((person) => person.personRef === personRef.value))
const selectedReport = computed(() => reports.value.find((report) => report.personRef === personRef.value && report.reportDate === form.reportDate))
const healthReadable = computed(() => canReadHealth.value && selectedPerson.value?.healthAuthorized === true && (selectedReport.value?.healthReadable ?? true))

function populate(): void {
  const report = selectedReport.value
  form.expectedVersion = report?.version ?? 0
  form.lodgingCheck = report?.lodgingCheck ?? ""
  form.mealStatus = report?.mealStatus ?? ""
  form.bodyStatus = report?.bodyStatus ?? ""
  form.note = report?.note ?? ""
  summary.value = report?.publicSummary ?? ""
}
watch([personRef, () => form.reportDate], populate)

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
      <el-form-item label="住宿查房"><el-input v-model="form.lodgingCheck" type="textarea" :disabled="busy || !canWrite" maxlength="4000" /></el-form-item>
      <el-form-item label="餐饮情况"><el-input v-model="form.mealStatus" type="textarea" :disabled="busy || !canWrite" maxlength="4000" /></el-form-item>
      <el-form-item label="身体情况"><el-input v-model="form.bodyStatus" type="textarea" :disabled="busy || !canWrite || !healthReadable" maxlength="4000" /></el-form-item>
      <el-form-item label="私人备注"><el-input v-model="form.note" type="textarea" :disabled="busy || !canWrite || !healthReadable" maxlength="4000" /></el-form-item>
      <p v-if="!healthReadable">身体情况与私人备注需健康读取权限及有效家属授权。保存住宿、餐饮记录会保留已有私密内容。</p>
      <el-button type="primary" :loading="busy" :disabled="!loaded || !canWrite || !personRef || !selectedPerson?.active || !form.lodgingCheck.trim() || !form.mealStatus.trim()" @click="save">保存个人日报</el-button>
      <template v-if="canPublish && selectedReport">
        <el-form-item label="给本订单家属的公开摘要"><el-input v-model="summary" type="textarea" maxlength="1000" :disabled="busy" /></el-form-item>
        <el-button :loading="busy" :disabled="!summary.trim()" @click="publish">批准公开摘要</el-button>
      </template>
    </el-form>
  </section>
</template>

<style scoped>
.person-daily { padding: var(--space-5); margin-bottom: var(--space-4); border-radius: var(--radius-card); background: var(--surface-elevated); color: var(--text-primary); }
.person-daily h2 { font-size: var(--font-h2); }
.person-daily p { color: var(--text-secondary); line-height: 1.6; }
.person-daily .el-form { margin-top: var(--space-4); }
@media (max-width: 768px) {
  .el-button { min-height: var(--size-touch-target); min-width: var(--size-touch-target); padding: var(--space-2) var(--space-3); }
  :deep(.el-input__wrapper), :deep(.el-select__wrapper) { min-height: var(--size-touch-target); box-sizing: border-box; }
}
</style>
