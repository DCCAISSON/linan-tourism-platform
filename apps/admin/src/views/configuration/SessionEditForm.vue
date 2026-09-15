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
        <label for="session-edit-price">修改价格（元）</label>
        <input id="session-edit-price" v-model.trim="editPriceYuan" inputmode="decimal" />
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
        <input id="session-edit-open" v-model="editEnrollmentOpensAt" type="date" />
      </div>
      <div class="field">
        <label for="session-edit-close">修改报名截止</label>
        <input id="session-edit-close" v-model="editEnrollmentClosesAt" type="date" />
      </div>
      <p v-if="visibleError" class="form-error">{{ visibleError }}</p>
      <button type="submit" :disabled="submitting || selectedSessionId === ''">保存团期修改</button>
    </fieldset>
  </form>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"

import type { TourSession, TourSessionUpdatePayload } from "@/api/configuration"
import { formatDate } from "./format"

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
const editStartsAt = ref("")
const localError = ref("")
const selectedSessionId = ref("")

const visibleError = computed(() => localError.value || props.formError)

watch(
  () => props.tourSessions,
  sessions => {
    if (selectedSessionId.value === "") {
      fillEditFields(sessions.at(0))
    }
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

  emit("update", {
    id: selectedSessionId.value,
    payload: {
      priceFen,
      startsAt: toIsoDate(editStartsAt.value),
      endsAt: toIsoDate(editEndsAt.value),
      enrollmentOpensAt: toIsoDate(editEnrollmentOpensAt.value),
      enrollmentClosesAt: toIsoDate(editEnrollmentClosesAt.value),
    },
  })
}

function fillEditFields(session: TourSession | undefined): void {
  selectedSessionId.value = session?.id ?? ""
  editPriceYuan.value = session === undefined ? "" : String(session.priceFen / 100)
  editStartsAt.value = session === undefined ? "" : formatDate(session.startsAt)
  editEndsAt.value = session === undefined ? "" : formatDate(session.endsAt)
  editEnrollmentOpensAt.value = session === undefined ? "" : formatDate(session.enrollmentOpensAt)
  editEnrollmentClosesAt.value = session === undefined ? "" : formatDate(session.enrollmentClosesAt)
}

function parsePriceFen(value: string): number {
  const yuan = Number(value)
  return Number.isFinite(yuan) ? Math.round(yuan * 100) : 0
}

function toIsoDate(value: string): string {
  return `${value}T00:00:00.000Z`
}
</script>
