<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue"
import { getCurrentStaff } from "../api/auth"
import { readableExecutionError } from "../api/execution"
import { executionNodeLabels, getExecutionNodes, occurrenceStatusLabels, saveExecutionNode, saveExecutionOccurrence, type ExecutionNode, type ExecutionNodeData, type ExecutionNodeType, type ExecutionOccurrence, type OccurrenceStatus } from "../api/execution-nodes"

const props = defineProps<{ sessionId: string; people: readonly { personRef: string; displayName: string }[]; startsAt: string; endsAt: string; manageable: boolean; editable: boolean }>()
const data = ref<ExecutionNodeData | null>(null)
const busy = ref(false)
const error = ref("")
const notice = ref("")
const writeAllowed = ref(false)
const manageAllowed = ref(false)
const canWrite = computed(() => props.editable && writeAllowed.value)
const canManage = computed(() => props.manageable && manageAllowed.value)
const dateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" })
const startsOn = computed(() => dateFormat.format(new Date(props.startsAt)))
const endsOn = computed(() => dateFormat.format(new Date(props.endsAt)))
const viewDate = ref("")
const viewDates = computed(() => {
  const dates: string[] = []
  for (let day = new Date(`${startsOn.value}T00:00:00Z`); day.toISOString().slice(0, 10) <= endsOn.value; day = new Date(day.getTime() + 86_400_000)) dates.push(day.toISOString().slice(0, 10))
  return dates
})
const visibleNodes = computed(() => data.value?.nodes.filter(node => !viewDate.value || node.reportDate === viewDate.value) ?? [])
const visibleRecords = computed(() => data.value?.records.filter(row => !viewDate.value || row.reportDate === viewDate.value) ?? [])
const visibleCounts = computed(() => {
  if (!data.value?.counts || !viewDate.value) return data.value?.counts ?? null
  const nodeIds = new Set(visibleNodes.value.filter(node => node.active).map(node => node.id))
  return data.value.progress.filter(row => nodeIds.has(row.nodeId)).reduce((sum, row) => ({ expected: sum.expected + row.expected, completed: sum.completed + row.completed, missing: sum.missing + row.missingPeople.length }), { expected: 0, completed: 0, missing: 0 })
})
const historyReferences = computed(() => new Map(data.value?.records.map(row => [row.id, `${row.reportDate} · ${row.label} · 版本 ${row.version}`])))
const plan = reactive<{ id: string; expectedVersion: number; reportDate: string; type: ExecutionNodeType; label: string; scheduledTime: string; active: boolean }>({ id: "", expectedVersion: 0, reportDate: startsOn.value, type: "attendance", label: "", scheduledTime: "", active: true })
const form = reactive<{ personRef: string; nodeId: string; reportDate: string; type: ExecutionNodeType; label: string; occurredAt: string; status: OccurrenceStatus; location: string; note: string; correctsId: string; expectedVersion: number; correctionReason: string }>({ personRef: "", nodeId: "", reportDate: startsOn.value, type: "attendance", label: "", occurredAt: "", status: "present", location: "", note: "", correctsId: "", expectedVersion: 0, correctionReason: "" })
const latestIds = computed(() => new Set((data.value?.records ?? []).filter(row => !(data.value?.records ?? []).some(other => other.correctsId === row.id)).map(row => row.id)))
const progress = computed(() => new Map(data.value?.progress.map(row => [row.nodeId, row])))
const peopleNames = computed(() => new Map(props.people.map(person => [person.personRef, person.displayName])))
const selectedNode = computed(() => data.value?.nodes.find(row => row.id === form.nodeId))
const isAttendance = computed(() => form.type === "attendance")
const availableNodes = computed(() => data.value?.nodes.filter(row => row.active && row.reportDate === form.reportDate) ?? [])
watch(() => form.type, () => { if (!form.correctsId) form.status = isAttendance.value ? "present" : "recorded" })
watch(() => form.reportDate, () => { if (!form.correctsId) { form.nodeId = ""; form.occurredAt = "" } })
watch(selectedNode, node => { if (node && !form.correctsId) { form.type = node.type; form.label = node.label } })

async function load(): Promise<void> {
  busy.value = true; error.value = ""
  try {
    const [result, staff] = await Promise.all([getExecutionNodes(props.sessionId), getCurrentStaff()])
    data.value = result
    writeAllowed.value = staff.permissionKeys.includes("execution.write")
    manageAllowed.value = staff.permissionKeys.includes("execution.manage")
  } catch (cause) { error.value = readableExecutionError(cause) }
  finally { busy.value = false }
}
function suggest(label: string, type: ExecutionNodeType = "attendance"): void {
  Object.assign(plan, { id: "", expectedVersion: 0, type, label, scheduledTime: "", active: true })
}
function editPlan(node: ExecutionNode): void { Object.assign(plan, node, { expectedVersion: node.version, scheduledTime: node.scheduledTime ?? "" }) }
async function savePlan(): Promise<void> {
  if (!canManage.value) return
  busy.value = true; error.value = ""; notice.value = ""
  try {
    await saveExecutionNode(props.sessionId, { ...(plan.id ? { id: plan.id } : {}), expectedVersion: plan.expectedVersion, reportDate: plan.reportDate, type: plan.type, label: plan.label, scheduledTime: plan.scheduledTime || null, active: plan.active })
    await load(); suggest(""); notice.value = "执行节点已保存。"
  } catch (cause) { error.value = readableExecutionError(cause) }
  finally { busy.value = false }
}
function correct(row: ExecutionOccurrence): void {
  Object.assign(form, row, { nodeId: row.nodeId ?? "", occurredAt: `${row.reportDate}T${new Date(row.occurredAt).toLocaleTimeString("en-GB", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", second: "2-digit" })}`, correctsId: row.id, expectedVersion: row.version, correctionReason: "" })
}
function resetRecord(): void { Object.assign(form, { correctsId: "", expectedVersion: 0, correctionReason: "", note: "", location: "", nodeId: "", label: "", status: isAttendance.value ? "present" : "recorded" }) }
async function saveRecord(): Promise<void> {
  if (!canWrite.value || !form.personRef || (form.correctsId && !form.correctionReason.trim())) return
  busy.value = true; error.value = ""; notice.value = ""
  try {
    await saveExecutionOccurrence(props.sessionId, { personRef: form.personRef, reportDate: form.reportDate, type: form.type, label: form.label, status: form.status, location: form.location, note: form.note, expectedVersion: form.expectedVersion, correctionReason: form.correctionReason, occurredAt: new Date(`${form.occurredAt}+08:00`).toISOString(), nodeId: form.nodeId || null, correctsId: form.correctsId || null })
    await load(); resetRecord(); notice.value = "发生记录已保存，历史记录已保留。"
  } catch (cause) { error.value = readableExecutionError(cause) }
  finally { busy.value = false }
}
onMounted(() => { void load() })
</script>

<template>
  <section class="execution-nodes" aria-label="执行节点与发生记录">
    <h2>执行节点与发生记录</h2>
    <p v-if="error" role="alert" class="error">{{ error }}</p><p v-if="notice" role="status" class="success">{{ notice }}</p>
    <button type="button" class="secondary" :disabled="busy" @click="load">刷新执行节点</button>
    <p v-if="busy" role="status">正在读取节点或保存记录…</p>
    <template v-if="data">
      <label>查看日期<select v-model="viewDate" :disabled="busy"><option value="">全部日期</option><option v-for="date in viewDates" :key="date" :value="date">{{ date }}</option></select></label>
      <p v-if="visibleCounts" aria-label="节点完成统计">应填 {{ visibleCounts.expected }} · 已填 {{ visibleCounts.completed }} · 未填 {{ visibleCounts.missing }}</p>
      <p v-else-if="data.nodes.some(node => node.active)">人车安排待确认，暂不计算应填人数；已保存记录仍可查看。</p>
      <p v-else>尚未配置应填节点，仅展示已发生记录。</p>
      <form v-if="canManage" class="node-form" aria-label="节点计划" @submit.prevent="savePlan">
        <h3 class="full">{{ plan.id ? '修改节点计划' : '配置本团节点' }}</h3>
        <p class="full">建议可调整，点击确认保存后才列为应填项；请按本团实际行程逐项配置。</p>
        <p v-if="plan.id" class="full">修改节点后须按新版本补记，原记录保留。</p>
        <div class="actions full"><button v-for="label in ['出发', '抵达', '返程']" :key="label" type="button" class="secondary" :disabled="busy" @click="suggest(label)">{{ label }}建议</button></div>
        <details class="full"><summary>住宿团查房建议（按需选择）</summary><p>若本团安排三次查房，可分别选择建议，修改并逐次确认保存。</p><div class="actions"><button v-for="index in 3" :key="index" type="button" class="secondary" :disabled="busy" @click="suggest(`第${index}次查房`, 'room_check')">第{{ index }}次查房建议</button></div></details>
        <label>计划日期<input v-model="plan.reportDate" type="date" :min="startsOn" :max="endsOn" required :disabled="busy" /></label>
        <label>节点类型<select v-model="plan.type" :disabled="busy"><option v-for="(label, type) in executionNodeLabels" :key="type" :value="type">{{ label }}</option></select></label>
        <label>节点标签<input v-model="plan.label" maxlength="100" required :disabled="busy" /></label>
        <label>计划时间（可不填）<input v-model="plan.scheduledTime" type="time" :disabled="busy" /></label>
        <label class="check"><input v-model="plan.active" type="checkbox" :disabled="busy" />列为应填节点</label>
        <div class="actions full"><button type="submit" :disabled="busy || !plan.label.trim()">确认保存节点</button><button v-if="plan.id" type="button" class="secondary" @click="suggest('')">取消修改</button></div>
      </form>
      <p v-if="visibleNodes.length === 0">所选日期暂无已配置节点。</p>
      <ul class="records" aria-label="已配置节点"><li v-for="node in visibleNodes" :key="node.id">
        <strong>{{ node.reportDate }} · {{ node.label }}</strong><p>{{ executionNodeLabels[node.type] }} · {{ node.scheduledTime ?? '时间待定' }} · {{ node.active ? '应填' : '已停用' }}</p>
        <template v-if="progress.has(node.id)">
          <p>应填 {{ progress.get(node.id)?.expected }} · 已填 {{ progress.get(node.id)?.completed }} · 未填 {{ progress.get(node.id)?.missingPeople.length }}</p>
          <p v-if="progress.get(node.id)?.missingPeople.length">未填：{{ progress.get(node.id)?.missingPeople.map(person => peopleNames.get(person) ?? '历史人员').join('、') }}</p>
          <p v-if="progress.get(node.id)?.absentPeople.length" class="warning">未到：{{ progress.get(node.id)?.absentPeople.map(person => peopleNames.get(person) ?? '历史人员').join('、') }}</p>
        </template>
        <button v-if="canManage" type="button" class="secondary" :disabled="busy" @click="editPlan(node)">修改节点 {{ node.label }}</button>
      </li></ul>
      <form v-if="canWrite" class="node-form" aria-label="实际发生记录" @submit.prevent="saveRecord">
        <h3 class="full">{{ form.correctsId ? '更正已发生记录' : '新增发生记录' }}</h3>
        <label>记录人员<select v-model="form.personRef" required :disabled="busy || !!form.correctsId"><option value="">请选择人员</option><option v-for="person in people" :key="person.personRef" :value="person.personRef">{{ person.displayName }}</option></select></label>
        <label>发生日期<input v-model="form.reportDate" type="date" :min="startsOn" :max="endsOn" required :disabled="busy || !!form.correctsId" /></label>
        <label>关联计划节点<select v-model="form.nodeId" :disabled="busy || !!form.correctsId"><option value="">额外发生记录（无计划）</option><option v-for="node in availableNodes" :key="node.id" :value="node.id">{{ node.label }}</option></select></label>
        <label>记录类型<select v-model="form.type" :disabled="busy || !!form.nodeId || !!form.correctsId"><option v-for="(label, type) in executionNodeLabels" :key="type" :value="type">{{ label }}</option></select></label>
        <label>发生记录标签<input v-model="form.label" required maxlength="100" :disabled="busy || !!form.nodeId || !!form.correctsId" /></label>
        <label>实际发生时间（北京时间）<input v-model="form.occurredAt" type="datetime-local" step="1" :min="`${form.reportDate}T00:00:00`" :max="`${form.reportDate}T23:59:59`" required :disabled="busy" /></label>
        <label>记录状态<select v-model="form.status" :disabled="busy"><template v-if="isAttendance"><option value="present">已到</option><option value="absent">未到</option><option value="revoked">已撤销</option></template><template v-else><option value="recorded">已记录</option><option value="not_applicable">不适用</option></template></select></label>
        <label>房间或地点<input v-model="form.location" maxlength="200" :disabled="busy" /></label>
        <label class="full">事实或情况<textarea v-model="form.note" rows="2" maxlength="1000" :disabled="busy" /></label>
        <label v-if="form.correctsId" class="full">更正原因<textarea v-model="form.correctionReason" rows="2" required maxlength="500" :disabled="busy" /></label>
        <div class="actions full"><button type="submit" :disabled="busy || !form.personRef || !form.label.trim() || (!!form.correctsId && !form.correctionReason.trim())">{{ form.correctsId ? '保存更正' : '保存发生记录' }}</button><button v-if="form.correctsId" type="button" class="secondary" :disabled="busy" @click="resetRecord">取消更正</button></div>
      </form>
      <h3>发生记录与更正历史</h3><p v-if="visibleRecords.length === 0">所选日期尚无发生记录。</p>
      <ul class="records" aria-label="发生记录历史"><li v-for="row in visibleRecords" :key="row.id"><strong>{{ people.find(person => person.personRef === row.personRef)?.displayName ?? '历史人员' }} · {{ row.reportDate }}<span class="history-label">{{ row.label }}</span></strong><p>{{ new Date(row.occurredAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) }} · {{ occurrenceStatusLabels[row.status] }} · {{ latestIds.has(row.id) ? '当前有效值' : '已被更正' }}</p><p v-if="row.location">房间或地点：{{ row.location }}</p><p v-if="row.note">{{ row.note }}</p><p v-if="row.correctsId">更正原因：{{ row.correctionReason }} · 原记录：{{ historyReferences.get(row.correctsId) ?? '历史记录' }}</p><p>记录人：{{ row.recordedByName }} · 记录时间：{{ new Date(row.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) }} · 版本 {{ row.version }}</p><button v-if="canWrite && latestIds.has(row.id)" type="button" class="secondary" :disabled="busy" @click="correct(row)">更正此记录</button></li></ul>
    </template>
  </section>
</template>

<style scoped>
.execution-nodes { display: grid; min-width: 0; gap: var(--space-3); padding: var(--space-5); margin-bottom: var(--space-4); background: var(--surface-elevated); border-radius: var(--radius-card); color: var(--text-primary); }
h2, h3, p { margin: 0; overflow-wrap: anywhere; } h2 { font-size: var(--font-h2); } h3 { font-size: var(--font-h3); } p { color: var(--text-secondary); line-height: 1.6; }
.error { color: var(--status-error); } .success { color: var(--status-success); } .warning { color: var(--status-warning); }
.node-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); padding: var(--space-4); background: var(--surface-secondary); border-radius: var(--radius-control); }
.full { grid-column: 1 / -1; } label { display: grid; min-width: 0; gap: var(--space-2); } .check { display: flex; align-items: center; } .check input { width: auto; }
input, select, textarea, button { box-sizing: border-box; min-width: 0; max-width: 100%; min-height: var(--size-touch-target); padding: var(--space-2) var(--space-3); font: inherit; border: 1px solid var(--border-default); border-radius: var(--radius-control); }
input, select, textarea { width: 100%; color: var(--text-primary); background: var(--surface-elevated); } button { color: var(--on-accent); background: var(--accent-primary); cursor: pointer; justify-self: start; } button.secondary { color: var(--accent-primary); background: var(--surface-elevated); } button:disabled { opacity: .6; cursor: not-allowed; }
button:hover:enabled { border-color: var(--accent-primary); } button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, summary:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
summary { min-height: var(--size-touch-target); cursor: pointer; } .actions { display: flex; gap: var(--space-2); flex-wrap: wrap; } .records { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-3); } .records li { min-width: 0; display: grid; gap: var(--space-2); padding: var(--space-3); background: var(--surface-secondary); border-radius: var(--radius-control); }
.history-label { display: block; overflow-wrap: anywhere; }
@media (max-width: 768px) { .node-form { grid-template-columns: 1fr; } }
</style>
