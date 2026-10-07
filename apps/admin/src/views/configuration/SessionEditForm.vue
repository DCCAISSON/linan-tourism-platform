<template>
  <form class="configuration-form configuration-form--grid" @submit.prevent="submit">
    <fieldset :disabled="submitting || tourSessions.length === 0">
      <div class="field">
        <label for="session-edit">编辑团期</label>
        <select id="session-edit" :value="selectedSessionId" @change="selectSession">
          <option value="">请选择团期</option>
          <option v-for="session in tourSessions" :key="session.id" :value="session.id">
            {{ session.code }}
          </option>
        </select>
      </div>
      <div class="field">
        <label for="session-edit-price">修改单价（元/人）</label>
        <input id="session-edit-price" v-model.trim="editPriceYuan" inputmode="decimal" aria-describedby="session-edit-price-help" />
        <small id="session-edit-price-help" class="state-text">学生、成人同价；修改后用于新订单，已有订单金额不变。</small>
      </div>
      <div class="field">
        <label for="session-edit-capacity">修改容量</label>
        <input id="session-edit-capacity" v-model.trim="editCapacity" inputmode="numeric" aria-describedby="session-edit-capacity-help" />
        <small id="session-edit-capacity-help" class="state-text">不能少于已付款有效人数（{{ selectedSession?.occupiedCapacity ?? '保存时核对' }}）；调整容量不改变已有订单。</small>
      </div>
      <div class="field">
        <label for="session-edit-minimum">修改最低人数参考（可选）</label>
        <input id="session-edit-minimum" v-model.trim="editMinimumParticipants" inputmode="numeric" aria-describedby="session-edit-minimum-help" />
        <small id="session-edit-minimum-help" class="state-text">留空关闭参考；有效人数包含已付款且未取消的所有参加人。</small>
      </div>
      <div class="field">
        <label for="session-edit-start">修改出发日期</label>
        <input id="session-edit-start" v-model="editStartsAt" type="date" />
      </div>
      <div class="field">
        <label for="session-edit-end">修改结束日期</label>
        <input id="session-edit-end" v-model="editEndsAt" type="date" />
      </div>
      <div class="field">
        <label for="session-edit-open">修改报名开始</label>
        <input id="session-edit-open" v-model="editEnrollmentOpensAt" type="datetime-local" step="60" aria-describedby="session-edit-open-help" />
        <small id="session-edit-open-help" class="state-text">北京时间，可设置到分钟。</small>
      </div>
      <div class="field">
        <label for="session-edit-close">修改报名截止</label>
        <input id="session-edit-close" v-model="editEnrollmentClosesAt" type="datetime-local" step="60" aria-describedby="session-edit-close-help" />
        <small id="session-edit-close-help" class="state-text">北京时间，按所选时刻截止报名。</small>
      </div>
      <SessionEnrollmentScope :key="selectedSessionId" v-model="enrollmentScope" input-id="session-edit-scope" :school-id="selectedSchoolId" @valid="scopeValid = $event" />
      <button type="button" :disabled="submitting || !scopeValid || !selectedSessionId" @click="saveScope">{{ submitting ? "保存中…" : "保存招生范围" }}</button>
      <p v-if="visibleError" class="form-error">{{ visibleError }}</p>
      <button type="submit" :disabled="submitting || selectedSessionId === ''">保存团期修改</button>
    </fieldset>
  </form>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"

import SessionEnrollmentScope from "./SessionEnrollmentScope.vue"
import type { EnrollmentScope } from "@/api/configuration"
import type { TourSession, TourSessionUpdatePayload } from "@/api/configuration"
import { formatBeijingDateTime, formatDate, parseBeijingDateTime } from "./format"

const props = defineProps<{
  readonly formError: string
  readonly submitting: boolean
  readonly tourSessions: readonly TourSession[]
}>()

const emit = defineEmits<{
  update: [change: { readonly id: string; readonly payload: TourSessionUpdatePayload }]
}>()

const editEndsAt = ref("")
const editEnrollmentClosesAt = ref("")
const editEnrollmentOpensAt = ref("")
const editPriceYuan = ref("")
const editCapacity = ref("")
const editMinimumParticipants = ref("")
const editStartsAt = ref("")
const localError = ref("")
const selectedSessionId = ref("")

const enrollmentScope = ref<EnrollmentScope>(null)
const scopeValid = ref(true)
const selectedSession = computed(() => props.tourSessions.find(item => item.id === selectedSessionId.value))
const selectedSchoolId = computed(() => props.tourSessions.find(item => item.id === selectedSessionId.value)?.organizationId ?? "")
function saveScope(): void {
  if (scopeValid.value && selectedSessionId.value) emit("update", { id: selectedSessionId.value, payload: { enrollmentScope: enrollmentScope.value } })
}

const visibleError = computed(() => localError.value || props.formError)

watch(
  () => props.tourSessions,
  sessions => {
    fillEditFields(sessions.find(item => item.id === selectedSessionId.value) ?? sessions.at(0))
  },
  { immediate: true },
)

function selectSession(event: Event): void {
  const target = event.target
  if (target instanceof HTMLSelectElement) {
    fillEditFields(props.tourSessions.find(session => session.id === target.value))
  }
}

function submit(): void {
  localError.value = ""
  const priceFen = parsePriceFen(editPriceYuan.value)

  if (selectedSessionId.value === "") {
    localError.value = "请选择要编辑的团期"
    return
  }

  if (priceFen < 0) {
    localError.value = "团期价格不能为负数"
    return
  }

  const minimumCount = editMinimumParticipants.value === "" ? null : Number(editMinimumParticipants.value)
  const session = selectedSession.value
  if (session === undefined) return
  const capacityCount = Number(editCapacity.value)
  if (!Number.isSafeInteger(capacityCount) || capacityCount <= 0) {
    localError.value = "容量必须为正整数"
    return
  }
  if (session.occupiedCapacity != null && capacityCount < session.occupiedCapacity) {
    localError.value = `容量不能少于已付款有效人数 ${session.occupiedCapacity} 人`
    return
  }
  if (minimumCount !== null && (!Number.isSafeInteger(minimumCount) || minimumCount <= 0 || minimumCount > capacityCount)) {
    localError.value = "最低人数须为不超过容量的正整数，留空可关闭"
    return
  }

  const opensAt = editEnrollmentOpensAt.value === formatBeijingDateTime(session.enrollmentOpensAt)
    ? session.enrollmentOpensAt : parseBeijingDateTime(editEnrollmentOpensAt.value)
  const closesAt = editEnrollmentClosesAt.value === formatBeijingDateTime(session.enrollmentClosesAt)
    ? session.enrollmentClosesAt : parseBeijingDateTime(editEnrollmentClosesAt.value)
  if (opensAt === null || closesAt === null) {
    localError.value = "请填写完整的报名日期和时间"
    return
  }
  if (Date.parse(closesAt) < Date.parse(opensAt)) {
    localError.value = "报名截止不能早于报名开始"
    return
  }

  emit("update", {
    id: selectedSessionId.value,
    payload: {
      priceFen,
      capacity: capacityCount,
      minimumParticipants: minimumCount,
      startsAt: editStartsAt.value === formatDate(session.startsAt) ? session.startsAt : toIsoDate(editStartsAt.value),
      endsAt: editEndsAt.value === formatDate(session.endsAt) ? session.endsAt : toIsoDate(editEndsAt.value),
      enrollmentOpensAt: opensAt,
      enrollmentClosesAt: closesAt,
    },
  })
}

function fillEditFields(session: TourSession | undefined): void {
  enrollmentScope.value = session?.enrollmentScope ?? null
  selectedSessionId.value = session?.id ?? ""
  editPriceYuan.value = session === undefined ? "" : String(session.priceFen / 100)
  editCapacity.value = session === undefined ? "" : String(session.capacity)
  editMinimumParticipants.value = session?.minimumParticipants == null ? "" : String(session.minimumParticipants)
  editStartsAt.value = session === undefined ? "" : formatDate(session.startsAt)
  editEndsAt.value = session === undefined ? "" : formatDate(session.endsAt)
  editEnrollmentOpensAt.value = session === undefined ? "" : formatBeijingDateTime(session.enrollmentOpensAt)
  editEnrollmentClosesAt.value = session === undefined ? "" : formatBeijingDateTime(session.enrollmentClosesAt)
}

function parsePriceFen(value: string): number {
  const yuan = Number(value)
  return Number.isFinite(yuan) ? Math.round(yuan * 100) : 0
}

function toIsoDate(value: string): string {
  return `${value}T00:00:00.000Z`
}
</script>
