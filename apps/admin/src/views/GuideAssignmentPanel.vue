<script setup lang="ts">
import { ref, watch } from "vue"
import { assignGuide, listGuideAssignmentCandidates, listGuideAssignments, readableExecutionError, revokeGuideAssignment, type ExecutionVehicle, type GuideAssignment, type GuideAssignmentCandidate } from "../api/execution"

const props = defineProps<{ sessionId: string; vehicles: readonly ExecutionVehicle[] }>()
const candidates = ref<readonly GuideAssignmentCandidate[]>([])
const assignments = ref<readonly GuideAssignment[]>([])
const staffAccountId = ref("")
const vehicleId = ref("")
const reason = ref("")
const revokeReason = ref("")
const busy = ref(false)
const error = ref("")
const notice = ref("")

async function load(): Promise<void> {
  busy.value = true
  error.value = ""
  try { [candidates.value, assignments.value] = await Promise.all([listGuideAssignmentCandidates(props.sessionId), listGuideAssignments(props.sessionId)]) }
  catch (cause) { error.value = readableExecutionError(cause) }
  finally { busy.value = false }
}
async function assign(): Promise<void> {
  if (!staffAccountId.value || !reason.value.trim()) return
  busy.value = true
  error.value = ""
  notice.value = ""
  try {
    await assignGuide(props.sessionId, { staffAccountId: staffAccountId.value, ...(vehicleId.value ? { vehicleId: vehicleId.value } : {}), reason: reason.value.trim() })
    await load()
    notice.value = "导游指派已保存。"
  } catch (cause) { error.value = readableExecutionError(cause) }
  finally { busy.value = false }
}
async function revoke(assignment: GuideAssignment): Promise<void> {
  if (!revokeReason.value.trim()) { error.value = "请先填写撤销原因。"; return }
  busy.value = true
  error.value = ""
  notice.value = ""
  try { await revokeGuideAssignment(assignment.id, revokeReason.value.trim()); await load(); notice.value = "导游指派已撤销。" }
  catch (cause) { error.value = readableExecutionError(cause) }
  finally { busy.value = false }
}
watch(() => props.sessionId, () => { staffAccountId.value = ""; vehicleId.value = ""; candidates.value = []; assignments.value = []; void load() }, { immediate: true })
</script>

<template>
  <section class="assignment-panel" aria-labelledby="guide-assignment-title">
    <h2 id="guide-assignment-title">导游指派</h2>
    <p>选定车辆后可处理本车人员；“全团查看”不授予点名和个人日报填写权限，团级事项按账号权限处理。</p>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <form @submit.prevent="assign">
      <fieldset :disabled="busy">
        <label>指派导游<select v-model="staffAccountId" required><option value="">请选择工作人员</option><option v-for="candidate in candidates" :key="candidate.staffAccountId" :value="candidate.staffAccountId">{{ candidate.displayName }}</option></select></label>
        <label>负责车辆<select v-model="vehicleId"><option value="">全团查看（不可点名）</option><option v-for="vehicle in vehicles" :key="vehicle.id" :value="vehicle.id">{{ vehicle.sequence }}号车 {{ vehicle.plateNumber }}</option></select></label>
        <label class="wide">指派说明<input v-model="reason" required maxlength="1000"></label>
        <button type="submit" :disabled="!staffAccountId || !reason.trim()">保存导游指派</button>
      </fieldset>
    </form>
    <p v-if="!busy && candidates.length === 0">当前团期没有可指派的有效工作人员。</p>
    <label>撤销原因<input v-model="revokeReason" :disabled="busy" maxlength="1000"></label>
    <ul class="assignment-list">
      <li v-for="assignment in assignments" :key="assignment.id">
        <div><strong>{{ assignment.displayName }}</strong><p>{{ assignment.vehicleId === null ? '全团查看（不可点名）' : `${vehicles.find(vehicle => vehicle.id === assignment.vehicleId)?.sequence ?? '待确认'}号车` }} · {{ assignment.active ? '指派有效' : '已撤销' }}</p></div>
        <button v-if="assignment.active" type="button" class="secondary" :disabled="busy || !revokeReason.trim()" @click="revoke(assignment)">撤销指派</button>
      </li>
    </ul>
    <p v-if="!busy && assignments.length === 0">尚未指派导游。</p>
  </section>
</template>

<style scoped>
.assignment-panel { display: grid; gap: var(--space-3); padding: var(--space-5); background: var(--surface-elevated); border-radius: var(--radius-card); min-width: 0; }
h2, p { margin: 0; } h2 { font-size: var(--font-h2); } p { color: var(--text-secondary); overflow-wrap: anywhere; }
fieldset { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); border: 0; padding: 0; margin: 0; min-width: 0; }
label { display: grid; gap: var(--space-2); min-width: 0; } .wide { grid-column: 1 / -1; }
input, select, button { box-sizing: border-box; min-width: 0; max-width: 100%; min-height: var(--size-touch-target); padding: var(--space-2) var(--space-3); font: inherit; border: 1px solid var(--border-default); border-radius: var(--radius-control); }
input, select { width: 100%; background: var(--surface-primary); color: var(--text-primary); }
button { cursor: pointer; background: var(--accent-primary); color: var(--on-accent); } button.secondary { background: var(--surface-elevated); color: var(--accent-primary); } button:disabled { opacity: .6; cursor: not-allowed; }
.assignment-list { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--space-2); }
li { display: flex; justify-content: space-between; gap: var(--space-3); align-items: center; padding: var(--space-3); background: var(--surface-secondary); border-radius: var(--radius-control); } li > div { min-width: 0; } strong { overflow-wrap: anywhere; } .error { color: var(--status-error); }
@media (max-width: 640px) { fieldset { grid-template-columns: 1fr; } li { flex-direction: column; align-items: stretch; } }
</style>
