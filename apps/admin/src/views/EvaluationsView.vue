<template>
  <section class="evaluation-page" aria-labelledby="evaluation-title">
    <header class="evaluation-card evaluation-heading">
      <div><p class="evaluation-eyebrow">学生评价</p><h2 id="evaluation-title">{{ schoolMode ? '学校评价报告' : '逐人评价与确认' }}</h2><p>学校报告只包含已确认的 A/B 等级。</p></div>
    </header>
    <section class="evaluation-card">
      <form class="evaluation-form" @submit.prevent="load">
        <label class="evaluation-field">团期<select v-model="sessionId" required :disabled="busy || loadingSessions"><option value="">{{ loadingSessions ? '团期加载中…' : '请选择团期' }}</option><option v-for="session in sessions" :key="session.id" :value="session.id">{{ session.title }} · {{ session.code }}</option></select></label>
        <button class="evaluation-button" :disabled="busy || loadingSessions || !sessionId">{{ busy ? '处理中…' : '加载评价' }}</button>
      </form>
      <p v-if="!loadingSessions && sessions.length === 0 && !error" class="evaluation-state">暂无可查看的团期，请联系工作人员确认权限或分配。</p>
      <p v-if="error" class="evaluation-error" role="alert">{{ error }}</p>
      <p v-if="message" class="evaluation-state" role="status">{{ message }}</p>
    </section>
    <section v-if="schoolRows && loadedSessionId === sessionId.trim()" class="evaluation-card">
      <p v-if="schoolRows.length === 0" class="evaluation-state">暂无已确认等级，未评级学生不会自动获得等级。</p>
      <template v-else>
        <p id="school-evaluation-scroll" class="evaluation-state">按姓名核对已确认等级。</p>
        <div class="evaluation-table-wrap" tabindex="0" role="region" aria-label="学校评价等级表" aria-describedby="school-evaluation-scroll"><table class="evaluation-table school-evaluation-table"><thead><tr><th>姓名</th><th>年级</th><th>班级</th><th>等级</th></tr></thead><tbody><tr v-for="row in schoolRows" :key="row.personRef"><td class="evaluation-cell-short">{{ row.displayName }}</td><td>{{ row.gradeName }}</td><td>{{ row.className }}</td><td>{{ row.gradeCode }} · {{ row.gradeLabel }}</td></tr></tbody></table></div>
      </template>
      <div class="evaluation-form"><p>本报告仅列出已确认的评价等级，不含内部观察记录。</p><button class="evaluation-button" :disabled="busy || reportOrganizationId !== loadedOrganizationId" @click="exportReport('xlsx')">导出 Excel</button><button class="evaluation-button" :disabled="busy || reportOrganizationId !== loadedOrganizationId" @click="exportReport('wordxml')">导出 Word XML</button></div>
    </section>
    <template v-if="dashboard && loadedSessionId === sessionId.trim()">
      <section class="evaluation-card">
        <p role="status">应评 {{ students.length }} 人 · 已评 {{ students.length - pendingStudents.length }} 人 · 未评 {{ pendingStudents.length }} 人</p>
        <p v-if="pendingStudents.length" class="evaluation-state">未评学生：{{ pendingStudents.map((student) => student.displayName).join('、') }}</p>
        <p class="evaluation-state">请按每名学生的实际表现选择等级；未操作保持未评级。</p>
      </section>
      <section v-if="canWrite && selectedStudent" class="evaluation-card">
        <form class="evaluation-form" @submit.prevent="save">
          <h3>评价：{{ selectedStudent.displayName }}</h3>
          <label class="evaluation-field">评价标准
            <select v-model="standardId" :disabled="busy || editing?.standardId != null">
              <option value="">仅内部观察</option>
              <option v-for="standard in confirmedStandards" :key="standard.id" :value="standard.id">{{ standard.title }}（版本 {{ standard.version }}）</option>
            </select>
          </label>
          <p v-if="!activeStandard" class="evaluation-state">未选择已确认标准，只能保存内部观察，不能评定 A/B。</p>
          <p v-for="item in activeStandard?.items" :key="item.code" class="evaluation-state">{{ item.code }} · {{ item.label }}：{{ item.description }}</p>
          <label class="evaluation-field">等级<select v-model="form.gradeCode" :disabled="busy || !activeStandard"><option :value="null">未评级</option><option v-for="item in activeStandard?.items" :key="item.code" :value="item.code">{{ item.code }} · {{ item.label }}</option></select></label>
          <label class="evaluation-field">内部观察<input v-model="form.internalComment" maxlength="500" :disabled="busy" /></label>
          <label v-for="dimension in dimensionFacts" :key="dimension.code" class="evaluation-field">{{ dimension.label }}（观察事实，可选）
            <small v-if="dimension.description">{{ dimension.description }}</small>
            <input v-model="dimension.observation" maxlength="500" :disabled="busy" />
          </label>
          <p v-if="dimensionFacts.length" class="evaluation-state">逐项记录仅供内部使用。未填写的项目不影响人工评级，也不会自动换算等级。</p>
          <label><input v-model="form.excellent" type="checkbox" :disabled="busy" /> 优秀标记</label>
          <label><input v-model="form.attention" type="checkbox" :disabled="busy" /> 关注标记</label>
          <p class="evaluation-state">保存会撤销所修改记录的确认状态；内部观察和标记不进入学校报告。</p>
          <button class="evaluation-button" :disabled="busy">保存当前学生评价</button>
          <button type="button" class="evaluation-button" :disabled="busy" @click="resetForm">取消修改</button>
        </form>
      </section>
      <section class="evaluation-card">
        <p v-if="students.length === 0" class="evaluation-state">暂无可评价学生，请先核对出行名单及资格。</p>
        <template v-else>
        <p id="staff-evaluation-scroll" class="evaluation-state">可左右滑动查看完整表格；键盘聚焦表格后可用左右方向键滚动。</p>
        <div class="evaluation-table-wrap" tabindex="0" role="region" aria-label="学生评价明细表" aria-describedby="staff-evaluation-scroll">
          <table class="evaluation-table staff-evaluation-table">
            <thead><tr><th class="evaluation-student-core">姓名<span class="evaluation-mobile-grade">等级</span></th><th>班级</th><th>等级</th><th>标记</th><th>内部观察</th><th>确认</th><th v-if="canWrite">操作</th></tr></thead>
            <tbody><tr v-for="student in students" :key="student.personRef">
              <td class="evaluation-cell-short evaluation-student-core">{{ student.displayName }}<span class="evaluation-mobile-grade">{{ student.evaluation?.gradeCode ?? '未评级' }} {{ student.evaluation?.gradeLabel ?? '' }}</span></td><td>{{ student.gradeName ?? '' }} {{ student.className ?? '' }}</td>
              <td class="evaluation-cell-short">{{ student.evaluation?.gradeCode ?? '未评级' }}<small>{{ student.evaluation?.gradeLabel ?? '' }}</small></td>
              <td class="evaluation-cell-short">{{ student.evaluation?.excellent ? '优秀' : '' }} {{ student.evaluation?.attention ? '关注' : '' }}</td>
              <td class="evaluation-cell-observations">{{ student.evaluation?.internalComment ?? '' }}<template v-if="student.evaluation"><small v-for="observation in student.evaluation.dimensionObservations" :key="observation.code">{{ observationLabel(student.evaluation, observation.code) }}：{{ observation.observation }}</small></template></td><td class="evaluation-cell-short">{{ student.evaluation?.confirmedAt ? '已确认' : '未确认' }}</td>
              <td v-if="canWrite" class="evaluation-cell-short"><button class="evaluation-button" :disabled="busy" @click="edit(student)">评价{{ student.displayName }}</button></td>
            </tr></tbody>
          </table>
        </div>
        </template>
        <button v-if="canConfirm" class="evaluation-button" :disabled="busy || !hasPendingGrades || pendingStudents.length > 0" @click="confirmGrades">确认本团期全部学生评价</button>
      </section>
      <section v-if="canExport" class="evaluation-card evaluation-form">
        <p>本报告仅列出已确认的评价等级，不含内部观察记录。</p>
        <button class="evaluation-button" :disabled="busy" @click="exportReport('xlsx')">导出 Excel</button>
        <button class="evaluation-button" :disabled="busy" @click="exportReport('wordxml')">导出 Word XML</button>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue"
import { useSessionQuery } from "@/layouts/useSessionQuery"
import { getCurrentStaff } from "@/api/auth"
import { batchEvaluate, confirmEvaluationSession, downloadEvaluationReport, listEvaluationSessions, loadEvaluationDashboard, loadSchoolEvaluations, reviseEvaluation, type EvaluationDashboard, type EvaluationRow, type EvaluationSession, type SchoolEvaluationRow } from "@/api/evaluations"
import { readableRosterError } from "@/api/roster.errors"
import "@/styles/evaluations.css"

const sessionId = ref("")
const sessions = ref<readonly EvaluationSession[]>([])
const sessionQuery = useSessionQuery(sessionId, id => sessions.value.some(row => row.id === id), () => busy.value)
const loadingSessions = ref(true)
const loadedSessionId = ref("")
const dashboard = ref<EvaluationDashboard>()
const busy = ref(false)
const error = ref("")
const message = ref("")
const canWrite = ref(false)
const canConfirm = ref(false)
const canExport = ref(false)
const schoolMode = ref(false)
const schoolRows = ref<readonly SchoolEvaluationRow[]>()
const reportOrganizationId = computed(() => sessions.value.find(session => session.id === sessionId.value)?.organizationId ?? "")
const loadedOrganizationId = ref("")
const standardId = ref("")
const selectedStudent = ref<EvaluationDashboard["students"][number]>()
const editing = ref<EvaluationRow>()
const dimensionFacts = ref<{ code: string; label: string; description: string; observation: string }[]>([])
const form = reactive<{ gradeCode: "A" | "B" | null; internalComment: string; excellent: boolean; attention: boolean }>({ gradeCode: null, internalComment: "", excellent: false, attention: false })
const confirmedStandards = computed(() => dashboard.value?.standards.filter((row) => row.confirmedAt !== null) ?? [])
const activeStandard = computed(() => confirmedStandards.value.find((row) => row.id === standardId.value))
const students = computed(() => dashboard.value?.students.map((student) => ({ ...student, evaluation: dashboard.value?.evaluations.find((row) => row.personRef === student.personRef) })) ?? [])
const pendingStudents = computed(() => students.value.filter((student) => student.evaluation?.gradeCode == null))
const hasPendingGrades = computed(() => students.value.some((student) => student.evaluation?.gradeCode != null && student.evaluation.confirmedAt === null))
onMounted(async () => {
  try { sessions.value = await listEvaluationSessions(); sessionQuery.initialize() }
  catch (cause) { error.value = readableRosterError(cause) }
  finally { loadingSessions.value = false }
})
watch(standardId, () => {
  if (!activeStandard.value) form.gradeCode = null
  dimensionFacts.value = activeStandard.value?.dimensions.map((dimension) => ({ ...dimension, observation: "" })) ?? []
}, { flush: "sync" })
watch(sessionId, () => { dashboard.value = undefined; schoolRows.value = undefined; loadedSessionId.value = ""; loadedOrganizationId.value = ""; error.value = ""; message.value = ""; resetForm() }, { flush: "sync" })

function observationLabel(row: EvaluationRow, code: string): string {
  return dashboard.value?.standards.find((standard) => standard.id === row.standardId)?.dimensions.find((dimension) => dimension.code === code)?.label ?? "观察项目"
}

function resetForm(): void {
  selectedStudent.value = undefined
  editing.value = undefined
  standardId.value = ""
  dimensionFacts.value = []
  Object.assign(form, { gradeCode: null, internalComment: "", excellent: false, attention: false })
}
function edit(student: typeof students.value[number]): void {
  resetForm()
  selectedStudent.value = student
  const row = student.evaluation
  if (!row) return
  editing.value = row
  standardId.value = row.standardId ?? ""
  Object.assign(form, { gradeCode: row.gradeCode, internalComment: row.internalComment, excellent: row.excellent, attention: row.attention })
  dimensionFacts.value = activeStandard.value?.dimensions.map((dimension) => ({ ...dimension, observation: row.dimensionObservations.find((item) => item.code === dimension.code)?.observation ?? "" })) ?? []
}
async function load(): Promise<void> {
  const id = sessionId.value.trim()
  const organizationId = reportOrganizationId.value.trim()
  const revision = sessionQuery.revision.value
  busy.value = true
  error.value = ""
  message.value = ""
  dashboard.value = undefined
  schoolRows.value = undefined
  try {
    const staff = await getCurrentStaff()
    if (revision !== sessionQuery.revision.value) return
    schoolMode.value = !staff.permissionKeys.includes("evaluations.read") && staff.permissionKeys.includes("evaluations.school_report")
    if (schoolMode.value) {
      const rows = await loadSchoolEvaluations(id, organizationId)
      if (revision !== sessionQuery.revision.value) return
      schoolRows.value = rows
      loadedOrganizationId.value = organizationId
      loadedSessionId.value = id
      return
    }
    const result = await loadEvaluationDashboard(id)
    if (revision !== sessionQuery.revision.value) return
    canWrite.value = staff.permissionKeys.includes("evaluations.write")
    canConfirm.value = staff.permissionKeys.includes("evaluations.confirm")
    canExport.value = staff.permissionKeys.includes("evaluations.school_report")
    dashboard.value = result
    loadedSessionId.value = id
    resetForm()
  } catch (cause) { if (revision === sessionQuery.revision.value) error.value = readableRosterError(cause) }
  finally { busy.value = false }
}
async function save(): Promise<void> {
  if (!selectedStudent.value) return
  busy.value = true
  error.value = ""
  message.value = ""
  try {
    const dimensionObservations = dimensionFacts.value.filter((dimension) => dimension.observation.trim().length > 0).map((dimension) => ({ code: dimension.code, observation: dimension.observation.trim() }))
    if (editing.value) await reviseEvaluation(editing.value, { ...form, dimensionObservations, ...(editing.value.standardId === null && standardId.value ? { standardId: standardId.value } : {}) })
    else await batchEvaluate({ tourSessionId: loadedSessionId.value, standardId: standardId.value || null, idempotencyKey: crypto.randomUUID(), observations: [{ personRef: selectedStudent.value.personRef, ...form, dimensionObservations }] })
    dashboard.value = await loadEvaluationDashboard(loadedSessionId.value)
    resetForm()
    message.value = "评价已保存，待授权人员确认。"
  } catch (cause) { error.value = readableRosterError(cause) }
  finally { busy.value = false }
}
async function confirmGrades(): Promise<void> {
  if (!window.confirm("确认本团期全部有效学生的人工 A/B 评价后，学校可获取这些等级。是否继续？")) return
  busy.value = true
  error.value = ""
  try {
    await confirmEvaluationSession(loadedSessionId.value)
    dashboard.value = await loadEvaluationDashboard(loadedSessionId.value)
    message.value = "本团期全部学生评价已确认。"
  } catch (cause) { error.value = readableRosterError(cause) }
  finally { busy.value = false }
}
async function exportReport(format: "xlsx" | "wordxml"): Promise<void> {
  const organizationId = schoolMode.value ? loadedOrganizationId.value : dashboard.value?.organizationId
  if (!organizationId) return
  busy.value = true
  error.value = ""
  try { await downloadEvaluationReport(loadedSessionId.value, organizationId, format) }
  catch (cause) { error.value = readableRosterError(cause) }
  finally { busy.value = false }
}
</script>

<style scoped>
.evaluation-field { min-width: 0; }
.evaluation-field select { box-sizing: border-box; width: 100%; min-width: 0; max-width: 100%; }
</style>
