<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue"
import { useRoute } from "vue-router"
import PersonDailyPanel from "./PersonDailyPanel.vue"
import { getCurrentStaff } from "../api/auth"
import { createExecutionEvent, getGuideSession, readableExecutionError, saveAttendance, saveDailyReport, type ExecutionEvent, type GuidePerson, type GuideSession, type PersonRef } from "../api/execution"

const route = useRoute()
const sessionId = computed(() => String(route.params["sessionId"] ?? route.query["sessionId"] ?? ""))
const loading = ref(false)
const saving = ref(false)
const error = ref("")
const session = ref<GuideSession | null>(null)
const canWrite = ref(false)
const viewScope = ref<"own" | "group">("own")
const confirmed = computed(() => session.value?.confirmationStatus === "current")
const canEdit = computed(() => confirmed.value && canWrite.value && viewScope.value === "own")
const attendanceLabels = { present: "已到", absent: "未到", revoked: "已撤销" } as const
const typeLabels: Readonly<Record<string, string>> = { student: "学生", adult: "成人", guardian: "家长", teacher: "教师" }
const today = new Date().toISOString().slice(0, 10)
const daily = reactive({ reportDate: today, lodgingCheck: "", mealStatus: "", bodyStatus: "", note: "" })
const eventForm = reactive<{ category: ExecutionEvent["category"]; occurredAt: string; personRef: PersonRef | ""; content: string }>({ category: "objective", occurredAt: new Date().toISOString(), personRef: "", content: "" })

async function load(): Promise<void> {
  if (sessionId.value.length === 0) return
  loading.value = true
  error.value = ""
  session.value = null
  try {
    const [result, staff] = await Promise.all([getGuideSession(sessionId.value), getCurrentStaff()])
    session.value = result
    canWrite.value = staff.permissionKeys.includes("execution.write")
    if (result.confirmationStatus !== "current") eventForm.personRef = ""
  }
  catch (cause) { error.value = readableExecutionError(cause) }
  finally { loading.value = false }
}

async function mark(person: GuidePerson, status: "present" | "absent" | "revoked"): Promise<void> {
  if (!canEdit.value || !person.active) return
  saving.value = true
  error.value = ""
  try {
    await saveAttendance(sessionId.value, person.personRef, { status, infoChecked: status === "revoked" ? false : true, groupJoined: status === "present", note: "" })
    await load()
  } catch (cause) { error.value = readableExecutionError(cause) }
  finally { saving.value = false }
}

async function submitDaily(): Promise<void> {
  if (!canWrite.value) return
  saving.value = true
  error.value = ""
  try { await saveDailyReport(sessionId.value, daily); await load() }
  catch (cause) { error.value = readableExecutionError(cause) }
  finally { saving.value = false }
}

async function submitEvent(): Promise<void> {
  if (!canWrite.value || (eventForm.personRef !== "" && !canEdit.value)) return
  saving.value = true
  error.value = ""
  try {
    await createExecutionEvent(sessionId.value, { ...eventForm, personRef: eventForm.personRef === "" ? null : eventForm.personRef })
    eventForm.content = ""
    await load()
  } catch (cause) { error.value = readableExecutionError(cause) }
  finally { saving.value = false }
}

watch(sessionId, () => { eventForm.personRef = ""; void load() }, { immediate: true })
</script>

<template>
  <main class="guide-session">
    <header class="toolbar">
      <div><p class="eyebrow">执行台</p><h1>{{ session?.code ?? '团期执行' }}</h1></div>
      <el-button :loading="loading" @click="load">刷新</el-button>
    </header>
    <el-alert v-if="error" type="error" :title="error" show-icon />
    <p v-if="loading" role="status">正在读取执行安排…</p>
    <p v-if="session && !confirmed" class="confirmation-notice" role="status">安排待确认：{{ session.confirmationStatus === 'stale' ? '人车安排已有调整，请重新确认后点名。' : '请先确认人车安排，再进行点名和个人日报填写。' }}</p>
    <nav v-if="session" class="scope-tabs" aria-label="执行名单范围">
      <button type="button" :aria-pressed="viewScope === 'own'" @click="viewScope = 'own'">本车执行</button>
      <button type="button" :aria-pressed="viewScope === 'group'" @click="viewScope = 'group'">全团名单（只读）</button>
    </nav>
    <section v-if="confirmed && viewScope === 'group'" class="panel" aria-label="全团只读名单">
      <h2>全团名单</h2>
      <p>仅供核对姓名、类型、班级和当前车辆。</p>
      <article v-for="person in session?.groupPeople ?? []" :key="person.personRef" class="person-row">
        <div><strong>{{ person.displayName }}</strong><p>{{ typeLabels[person.importedRole ?? person.participantKind ?? ''] ?? '参加人' }} · {{ person.gradeName ?? '' }}{{ person.className ?? '未分班' }} · {{ person.vehicleSequence === null ? '车辆待补' : `${person.vehicleSequence}号车` }}</p></div>
      </article>
      <p v-if="!session?.groupPeople.length">暂无已确认人员。</p>
    </section>
    <section v-if="confirmed && viewScope === 'own'" class="panel">
      <h2>逐人点名</h2>
      <div class="people-list">
        <article v-for="person in session?.people ?? []" :key="person.personRef" class="person-row" :class="{ inactive: !person.active }">
          <div>
            <strong>{{ person.displayName }}</strong>
            <p>{{ person.className ?? '未分班' }} · {{ session?.vehicles.find(vehicle => vehicle.id === person.vehicleId)?.sequence ?? '待补' }}号车 · {{ person.attendance ? attendanceLabels[person.attendance.status] : '未点名' }}</p>
            <p v-if="person.attendance && person.attendance.vehicleId !== person.vehicleId">保留调车前的点名记录；当前车辆以上方安排为准。</p>
            <p v-if="!person.active">不可新增点名：{{ person.inactiveReason }}</p>
          </div>
          <div class="actions">
            <el-button size="small" type="success" :disabled="saving || !canEdit || !person.active" @click="mark(person, 'present')">到齐</el-button>
            <el-button size="small" :disabled="saving || !canEdit || !person.active" @click="mark(person, 'absent')">未到</el-button>
            <el-button size="small" type="warning" :disabled="saving || !canEdit || !person.active" @click="mark(person, 'revoked')">撤销</el-button>
          </div>
        </article>
      </div>
      <p v-if="!session?.people.length">未指派本车人员，可切换全团名单查看。</p>
    </section>
    <PersonDailyPanel v-if="session && confirmed && viewScope === 'own' && session.people.length" :key="sessionId" :session-id="sessionId" :people="session.people" :starts-at="session.startsAt" :ends-at="session.endsAt" :editable="canEdit" />
    <section v-if="session && viewScope === 'own'" class="panel form-grid">
      <div>
        <h2>团级日报事实</h2>
        <el-form label-position="top">
          <el-form-item label="日期"><el-input v-model="daily.reportDate" /></el-form-item>
          <el-form-item label="住宿查房"><el-input v-model="daily.lodgingCheck" type="textarea" /></el-form-item>
          <el-form-item label="餐饮情况"><el-input v-model="daily.mealStatus" type="textarea" /></el-form-item>
          <el-form-item label="身体情况"><el-input v-model="daily.bodyStatus" type="textarea" /></el-form-item>
          <el-form-item label="备注"><el-input v-model="daily.note" type="textarea" /></el-form-item>
          <el-button type="primary" :loading="saving" :disabled="!canWrite" @click="submitDaily">保存日报</el-button>
        </el-form>
      </div>
      <div>
        <h2>客观事件</h2>
        <el-form label-position="top">
          <el-form-item label="分类"><el-select v-model="eventForm.category"><el-option label="客观" value="objective" /><el-option label="健康" value="health" /><el-option label="安全" value="safety" /><el-option label="其他" value="other" /></el-select></el-form-item>
          <el-form-item label="关联人员"><el-select v-model="eventForm.personRef" :disabled="!canEdit"><el-option label="全团事项（不关联人员）" value="" /><el-option v-for="person in confirmed ? session.people : []" :key="person.personRef" :label="person.displayName" :value="person.personRef" /></el-select></el-form-item>
          <el-form-item label="内容"><el-input v-model="eventForm.content" type="textarea" /></el-form-item>
          <el-button type="primary" :loading="saving" :disabled="!canWrite" @click="submitEvent">记录事件</el-button>
        </el-form>
      </div>
    </section>
  </main>
</template>

<style scoped>
.guide-session { min-width: 0; color: var(--text-primary); }
.toolbar { display: flex; justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-4); }
.eyebrow { margin: 0 0 var(--space-2); color: var(--accent-primary); font-weight: 700; }
h1, h2 { margin: 0 0 var(--space-3); overflow-wrap: anywhere; }
h1 { font-size: var(--font-h1); } h2 { font-size: var(--font-h2); }
.panel { min-width: 0; background: var(--surface-elevated); border-radius: var(--radius-card); padding: var(--space-5); margin-bottom: var(--space-4); }
.people-list { display: grid; gap: var(--space-3); }
.person-row { display: flex; justify-content: space-between; gap: var(--space-4); padding: var(--space-3); border-radius: var(--radius-card); background: var(--surface-secondary); margin-bottom: var(--space-2); }
.person-row p, .panel p { margin: var(--space-1) 0 0; color: var(--text-secondary); overflow-wrap: anywhere; }
.person-row.inactive { border: 1px solid var(--status-warning); }
.actions { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-6); }
.scope-tabs { display: flex; gap: var(--space-2); margin: var(--space-4) 0; flex-wrap: wrap; }
.scope-tabs button { min-height: var(--size-touch-target); padding: var(--space-2) var(--space-4); border: 1px solid var(--border-default); border-radius: var(--radius-control); background: var(--surface-elevated); color: var(--text-primary); font: inherit; cursor: pointer; }
.scope-tabs button[aria-pressed="true"] { border-color: var(--accent-primary); background: var(--accent-soft); color: var(--accent-primary); }
.confirmation-notice { padding: var(--space-4); color: var(--status-warning); background: var(--surface-elevated); }
@media (max-width: 768px) {
  .toolbar, .person-row { flex-direction: column; }
  .form-grid { grid-template-columns: 1fr; }
  .el-button { min-height: var(--size-touch-target); min-width: var(--size-touch-target); padding: var(--space-2) var(--space-3); font-size: var(--font-body-sm); }
  .actions .el-button + .el-button { margin-left: 0; }
  .form-grid :deep(.el-input__wrapper), .form-grid :deep(.el-select__wrapper) { min-height: var(--size-touch-target); box-sizing: border-box; }
}
</style>
