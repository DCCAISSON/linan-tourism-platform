<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { chinaDate, type NodeSelection } from "../../guide-execution-state"
import { nodeLabels, statusLabels, type ExecutionOccurrence, type GuidePerson, type GuideSession, type NodeData, type OccurrenceInput } from "../../guide-execution-api"
import OccurrenceForm from "./OccurrenceForm.vue"
import OccurrenceHistory from "./OccurrenceHistory.vue"

const props = defineProps<{ session: GuideSession; data: NodeData; selection: NodeSelection | null; attendance: boolean; canWrite: boolean; busy: boolean }>()
const emit = defineEmits<{ save: [payload: OccurrenceInput]; select: [selection: NodeSelection] }>()
const startsOn = chinaDate(props.session.startsAt)
const endsOn = chinaDate(props.session.endsAt)
const today = chinaDate(new Date().toISOString())
const date = ref(props.selection?.date ?? (today < startsOn ? startsOn : today > endsOn ? endsOn : today))
const nodeId = ref("")
const selectedPerson = ref<GuidePerson | null>(null)
const previous = ref<ExecutionOccurrence | null>(null)
const ownPeople = computed(() => props.session.people.filter(person => props.session.vehicleIds.includes(person.vehicleId)))
const availableNodes = computed(() => props.data.nodes.filter(node => node.active && node.reportDate === date.value && (props.attendance ? node.type === "attendance" : node.type !== "attendance")))
const choices = computed(() => [...availableNodes.value.map(node => ({ id: node.id, label: `${node.scheduledTime ? node.scheduledTime + ' · ' : ''}${node.label}（${nodeLabels[node.type]}）` })), { id: "", label: props.attendance ? "临时点名（无计划节点）" : "额外用餐或查房记录" }])
const node = computed(() => props.data.nodes.find(row => row.id === nodeId.value) ?? null)
const progress = computed(() => props.data.progress.find(row => row.nodeId === nodeId.value))
const records = computed(() => props.data.records.filter(row => row.reportDate === date.value && (props.attendance ? row.type === "attendance" : row.type !== "attendance")))
const correctedIds = computed(() => new Set(props.data.records.map(row => row.correctsId)))
watch(availableNodes, nodes => {
  const selected = props.selection
  nodeId.value = selected?.date === date.value && (selected.nodeId === "" || nodes.some(node => node.id === selected.nodeId)) ? selected.nodeId : nodes[0]?.id ?? ""
  emit("select", { date: date.value, nodeId: nodeId.value })
  cancel()
}, { immediate: true })
function cancel(): void { selectedPerson.value = null; previous.value = null }
function chooseNode(event: { detail: { value: string | number } }): void { nodeId.value = choices.value[Number(event.detail.value)]?.id ?? ""; emit("select", { date: date.value, nodeId: nodeId.value }); cancel() }
function latest(personRef: string): ExecutionOccurrence | undefined {
  const selectedNode = node.value
  if (!selectedNode) return undefined
  return [...records.value].reverse().find(row => row.personRef === personRef && row.nodeId === selectedNode.id && row.nodeVersion === selectedNode.version && !correctedIds.value.has(row.id))
}
function mark(person: GuidePerson): void { selectedPerson.value = person; previous.value = latest(person.personRef) ?? null; uni.pageScrollTo({ scrollTop: 0, duration: 0 }) }
function correct(row: ExecutionOccurrence): void {
  nodeId.value = row.nodeId ?? ""
  previous.value = row
  selectedPerson.value = ownPeople.value.find(person => person.personRef === row.personRef) ?? null
  uni.pageScrollTo({ scrollTop: 0, duration: 0 })
}
function currentLabel(person: GuidePerson): string {
  const record = latest(person.personRef)
  if (record) return statusLabels[record.status]
  return node.value ? "未填" : "按实际情况记录"
}
function vehicleLabel(vehicleId: string): string { const vehicle = props.session.vehicles.find(row => row.id === vehicleId); return vehicle ? `${vehicle.sequence}号车` : "所带车辆" }
</script>

<template>
  <view class="guide-section">
    <label class="guide-field"><text>记录日期</text><picker mode="date" :value="date" :start="startsOn" :end="endsOn" :disabled="busy || !!previous" @change="date = $event.detail.value; cancel()"><view class="guide-picker">{{ date }} · 点击选择</view></picker></label>
    <label class="guide-field"><text>{{ attendance ? '点名节点' : '用餐与查房节点' }}</text><picker :range="choices" range-key="label" :value="choices.findIndex(choice => choice.id === nodeId)" :disabled="busy || !!previous" @change="chooseNode"><view class="guide-picker">{{ node ? node.label : choices[choices.length - 1]?.label }} · 点击选择</view></picker></label>
    <text v-if="progress" class="guide-count">应填 {{ progress.expected }} · 已填 {{ progress.completed }} · 未填 {{ progress.missingPeople.length }}<template v-if="attendance"> · 未到 {{ progress.absentPeople.length }}</template></text>
    <text v-if="availableNodes.length === 0" class="guide-muted">本日尚无已配置的{{ attendance ? '点名' : '用餐或查房' }}节点，可按实际情况逐人记录。</text>
    <OccurrenceForm v-if="selectedPerson" :key="`${selectedPerson.personRef}:${previous?.id ?? nodeId}`" :person="selectedPerson" :date="date" :node="previous ? null : node" :previous="previous" :attendance="attendance" :busy="busy" @save="emit('save', $event)" @cancel="cancel" />
    <text class="guide-subtitle">本车人员</text>
    <text v-if="ownPeople.length === 0" class="guide-muted">当前没有分配到本人车辆的人员，请联系工作人员核对。</text>
    <view v-for="person in ownPeople" :key="person.personRef" class="guide-person-row">
      <view class="guide-person"><text class="guide-person-name">{{ person.displayName }}</text><text class="guide-muted">{{ vehicleLabel(person.vehicleId) }} · {{ person.className || '班级未填写' }}</text><text :class="person.active ? '' : 'guide-warning'">{{ person.active ? currentLabel(person) : person.inactiveReason || '当前不可填写' }}</text></view>
      <button v-if="canWrite && person.active" class="guide-secondary" :disabled="busy" @tap="mark(person)">{{ latest(person.personRef) ? '更正' : '填写' }}</button>
    </view>
    <OccurrenceHistory :records="records" :people="ownPeople" :can-write="canWrite" :busy="busy" @correct="correct" />
  </view>
</template>
