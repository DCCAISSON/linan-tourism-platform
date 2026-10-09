<script setup lang="ts">
import { computed } from "vue"
import { displayTime } from "../../guide-execution-state"
import { statusLabels, type ExecutionOccurrence, type GuidePerson } from "../../guide-execution-api"
const props = defineProps<{ records: readonly ExecutionOccurrence[]; people: readonly GuidePerson[]; canWrite: boolean; busy: boolean }>()
const emit = defineEmits<{ correct: [record: ExecutionOccurrence] }>()
const correctedIds = computed(() => new Set(props.records.map(record => record.correctsId)))
const recent = computed(() => [...props.records].reverse())
function canCorrect(row: ExecutionOccurrence): boolean { return props.canWrite && !correctedIds.value.has(row.id) && props.people.some(person => person.personRef === row.personRef && person.active) }
function name(ref: string): string { return props.people.find(person => person.personRef === ref)?.displayName ?? "历史人员" }
function original(id: string): string {
  const row = props.records.find(record => record.id === id)
  return row ? `${displayTime(row.occurredAt)} · ${row.label} · ${statusLabels[row.status]}` : "历史记录"
}
</script>

<template>
  <view class="guide-section">
    <text class="guide-subtitle">发生记录与更正历史</text>
    <text v-if="recent.length === 0" class="guide-muted">所选日期暂无记录。</text>
    <view v-for="row in recent" :key="row.id" class="guide-row">
      <text class="guide-person-name">{{ name(row.personRef) }} · {{ row.label }}</text>
      <text>{{ displayTime(row.occurredAt) }} · {{ statusLabels[row.status] }}</text>
      <text class="guide-muted">{{ correctedIds.has(row.id) ? '已被更正' : '当前记录' }} · {{ row.recordedByName }} · 版本 {{ row.version }}</text>
      <text v-if="row.location">房间或地点：{{ row.location }}</text><text v-if="row.note" class="guide-note">{{ row.note }}</text>
      <text v-if="row.correctsId" class="guide-note">更正原因：{{ row.correctionReason }}</text>
      <text v-if="row.correctsId" class="guide-muted">原记录：{{ original(row.correctsId) }}</text>
      <text class="guide-muted">记录于 {{ displayTime(row.createdAt) }}</text>
      <button v-if="canCorrect(row)" class="guide-secondary" :disabled="busy" @tap="emit('correct', row)">更正此记录</button>
    </view>
  </view>
</template>
