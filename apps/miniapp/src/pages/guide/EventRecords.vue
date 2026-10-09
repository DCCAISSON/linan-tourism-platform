<script setup lang="ts">
import { computed, reactive } from "vue"
import { chinaDate, displayTime } from "../../guide-execution-state"
import { eventLabels, type EventInput, type GuideSession } from "../../guide-execution-api"
const props = defineProps<{ session: GuideSession; canWrite: boolean; busy: boolean }>()
const emit = defineEmits<{ save: [payload: EventInput] }>()
const startsOn = chinaDate(props.session.startsAt)
const endsOn = chinaDate(props.session.endsAt)
const today = chinaDate(new Date().toISOString())
const form = reactive<{ personRef: string; category: EventInput["category"]; date: string; time: string; content: string }>({ personRef: "", category: "objective", date: today < startsOn ? startsOn : today > endsOn ? endsOn : today, time: "", content: "" })
const people = computed(() => props.session.people.filter(person => person.active && props.session.vehicleIds.includes(person.vehicleId)))
const selectedPerson = computed(() => people.value.find(person => person.personRef === form.personRef))
const categories: readonly { readonly value: EventInput["category"]; readonly label: string }[] = [{ value: "objective", label: "现场情况" }, { value: "safety", label: "安全情况" }, { value: "other", label: "其他情况" }]
const events = computed(() => [...props.session.events].filter(event => event.personRef === null || props.session.people.some(person => person.personRef === event.personRef && props.session.vehicleIds.includes(person.vehicleId))).reverse())
function choosePerson(event: { detail: { value: string | number } }): void { form.personRef = people.value[Number(event.detail.value)]?.personRef ?? "" }
function chooseCategory(event: { detail: { value: string | number } }): void { form.category = categories[Number(event.detail.value)]?.value ?? "objective" }
function name(personRef: string | null): string { return personRef === null ? "团期情况" : props.session.people.find(person => person.personRef === personRef)?.displayName ?? "历史人员" }
function save(): void {
  if (!props.canWrite || props.busy || !selectedPerson.value || !form.time || !form.content.trim()) return
  emit("save", { personRef: selectedPerson.value.personRef, category: form.category, occurredAt: new Date(`${form.date}T${form.time}:00+08:00`).toISOString(), content: form.content.trim() })
}
</script>

<template>
  <view class="guide-section">
    <text class="guide-subtitle">现场事件</text>
    <view v-if="canWrite && people.length" class="guide-form">
      <label class="guide-field"><text>涉及人员</text><picker :range="people" range-key="displayName" :disabled="busy" @change="choosePerson"><view class="guide-picker">{{ selectedPerson?.displayName || '请选择本车人员' }}</view></picker></label>
      <label class="guide-field"><text>事件类别</text><picker :range="categories" range-key="label" :disabled="busy" @change="chooseCategory"><view class="guide-picker">{{ eventLabels[form.category] }} · 点击选择</view></picker></label>
      <label class="guide-field"><text>发生日期</text><picker mode="date" :value="form.date" :start="startsOn" :end="endsOn" :disabled="busy" @change="form.date = $event.detail.value"><view class="guide-picker">{{ form.date }}</view></picker></label>
      <label class="guide-field"><text>发生时间（北京时间）</text><picker mode="time" :value="form.time" :disabled="busy" @change="form.time = $event.detail.value"><view class="guide-picker">{{ form.time || '请选择发生时间' }}</view></picker></label>
      <label class="guide-field"><text>事件经过</text><textarea v-model="form.content" :disabled="busy" maxlength="1000" placeholder="填写发生了什么、已如何处理" /></label>
      <button class="guide-primary" :disabled="busy || !selectedPerson || !form.time || !form.content.trim()" :loading="busy" @tap="save">保存事件</button>
    </view>
    <text v-if="events.length === 0" class="guide-muted">暂无现场事件记录。</text>
    <view v-for="event in events" :key="event.id" class="guide-row"><text class="guide-person-name">{{ name(event.personRef) }} · {{ eventLabels[event.category] }}</text><text class="guide-muted">{{ displayTime(event.occurredAt) }}</text><text class="guide-note">{{ event.content || event.publicSummary || '事件已记录，暂无可展示内容。' }}</text></view>
  </view>
</template>
