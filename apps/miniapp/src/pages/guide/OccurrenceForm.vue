<script setup lang="ts">
import { computed, reactive } from "vue"
import { chinaTime } from "../../guide-execution-state"
import { nodeLabels, statusLabels, type ExecutionNode, type ExecutionOccurrence, type NodeType, type OccurrenceInput, type OccurrenceStatus, type GuidePerson } from "../../guide-execution-api"

const props = defineProps<{ person: GuidePerson; date: string; node: ExecutionNode | null; previous: ExecutionOccurrence | null; attendance: boolean; busy: boolean }>()
const emit = defineEmits<{ save: [payload: OccurrenceInput]; cancel: [] }>()
const draft = reactive({ type: props.previous?.type ?? props.node?.type ?? (props.attendance ? "attendance" : "breakfast"), label: props.previous?.label ?? props.node?.label ?? "", status: props.previous?.status ?? "", time: props.previous ? chinaTime(props.previous.occurredAt) : "", location: props.previous?.location ?? "", note: props.previous?.note ?? "", reason: "" })
const extraTypes: readonly { readonly value: NodeType; readonly label: string }[] = [{ value: "breakfast", label: "早餐" }, { value: "lunch", label: "午餐" }, { value: "dinner", label: "晚餐" }, { value: "room_check", label: "查房" }]
const statuses = computed<readonly OccurrenceStatus[]>(() => draft.type === "attendance" ? ["present", "absent", "revoked"] : ["recorded", "not_applicable"])
const ready = computed(() => !!draft.label.trim() && !!draft.status && !!draft.time && (!props.previous || !!draft.reason.trim()))
function chooseType(event: { detail: { value: string | number } }): void {
  const next = extraTypes[Number(event.detail.value)]
  if (next) { draft.type = next.value; draft.label = next.label; draft.status = "" }
}
function save(): void {
  if (!ready.value || props.busy || !isStatus(draft.status)) return
  const time = draft.time.length === 5 ? `${draft.time}:00` : draft.time
  emit("save", { personRef: props.person.personRef, reportDate: props.previous?.reportDate ?? props.date, type: draft.type, label: draft.label.trim(), status: draft.status, occurredAt: new Date(`${props.previous?.reportDate ?? props.date}T${time}+08:00`).toISOString(), location: draft.location.trim(), note: draft.note.trim(), nodeId: props.previous?.nodeId ?? props.node?.id ?? null, correctsId: props.previous?.id ?? null, expectedVersion: props.previous?.version ?? 0, correctionReason: draft.reason.trim() })
}
function isStatus(value: string): value is OccurrenceStatus { return statuses.value.some(status => status === value) }
</script>

<template>
  <view class="guide-form" aria-label="逐人执行记录">
    <text class="guide-subtitle">{{ previous ? '更正' : '填写' }}{{ person.displayName }}的记录</text>
    <text v-if="previous" class="guide-muted">{{ previous.reportDate }} · {{ previous.label }}；更正后保留原记录。</text>
    <label v-if="!node && !previous && !attendance" class="guide-field"><text>记录类型</text><picker :range="extraTypes" range-key="label" :disabled="busy" @change="chooseType"><view class="guide-picker">{{ nodeLabels[draft.type] }} · 点击选择</view></picker></label>
    <label v-if="!node && !previous" class="guide-field"><text>记录名称</text><input v-model="draft.label" :disabled="busy" maxlength="100" placeholder="如返程点名、午餐、第一次查房" /></label>
    <view class="guide-field"><text>实际状态</text><view class="guide-actions"><button v-for="status in statuses" :key="status" :class="['guide-choice', { selected: draft.status === status }]" :disabled="busy" @tap="draft.status = status">{{ draft.status === status ? '已选 · ' : '' }}{{ statusLabels[status] }}</button></view></view>
    <label class="guide-field"><text>实际发生时间（北京时间）</text><picker mode="time" :value="draft.time.slice(0, 5)" :disabled="busy" @change="draft.time = $event.detail.value"><view class="guide-picker">{{ draft.time || '请选择发生时间' }}</view></picker></label>
    <label class="guide-field"><text>房间或地点（选填）</text><input v-model="draft.location" :disabled="busy" maxlength="200" placeholder="填写实际房间或地点" /></label>
    <label class="guide-field"><text>情况说明（选填）</text><textarea v-model="draft.note" :disabled="busy" maxlength="1000" placeholder="记录实际情况" /></label>
    <label v-if="previous" class="guide-field"><text>更正原因</text><textarea v-model="draft.reason" :disabled="busy" maxlength="500" placeholder="说明原记录哪里需要更正" /></label>
    <view class="guide-actions"><button class="guide-primary" :loading="busy" :disabled="busy || !ready" @tap="save">{{ previous ? '保存更正' : '保存记录' }}</button><button class="guide-secondary" :disabled="busy" @tap="emit('cancel')">取消</button></view>
  </view>
</template>
