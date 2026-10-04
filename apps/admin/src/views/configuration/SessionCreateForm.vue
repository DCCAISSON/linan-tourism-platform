<template>
  <form class="configuration-form configuration-form--grid" @submit.prevent="submit">
    <fieldset :disabled="submitting || catalogItems.length === 0 || schools.length === 0">
      <div class="field">
        <label for="session-school">团期学校</label>
        <select id="session-school" v-model="organizationId">
          <option value="">请选择学校</option>
          <option v-for="school in schools" :key="school.id" :value="school.id">
            {{ school.name }}
          </option>
        </select>
      </div>
      <div class="field">
        <label for="session-catalog">团期课程</label>
        <select id="session-catalog" v-model="catalogItemId">
          <option value="">请选择课程</option>
          <option v-for="item in catalogItems" :key="item.id" :value="item.id">
            {{ item.title }}
          </option>
        </select>
      </div>
      <div class="field">
        <label for="session-code">团期编码</label>
        <input id="session-code" v-model.trim="code" autocomplete="off" />
      </div>
      <div class="field">
        <label for="session-price">团期单价（元/人）</label>
        <input id="session-price" v-model.trim="priceYuan" inputmode="decimal" aria-describedby="session-price-help" />
        <small id="session-price-help" class="state-text">学生、成人同价，按报名人数计费。</small>
      </div>
      <div class="field">
        <label for="session-capacity">容量</label>
        <input id="session-capacity" v-model.trim="capacity" inputmode="numeric" />
      </div>
      <div class="field">
        <label for="session-minimum">最低人数参考（可选）</label>
        <input id="session-minimum" v-model.trim="minimumParticipants" inputmode="numeric" aria-describedby="session-minimum-help" />
        <small id="session-minimum-help" class="state-text">留空不启用，学校大团默认留空；仅供人数参考。</small>
      </div>
      <div class="field">
        <label for="session-start">出发日期</label>
        <input id="session-start" v-model="startsAt" type="date" />
      </div>
      <div class="field">
        <label for="session-end">结束日期</label>
        <input id="session-end" v-model="endsAt" type="date" />
      </div>
      <div class="field">
        <label for="enrollment-open">报名开始</label>
        <input id="enrollment-open" v-model="enrollmentOpensAt" type="date" />
      </div>
      <div class="field">
        <label for="enrollment-close">报名截止</label>
        <input id="enrollment-close" v-model="enrollmentClosesAt" type="date" />
      </div>
      <div class="field">
        <label for="session-status">团期状态</label>
        <select id="session-status" v-model="status">
          <option value="draft">草稿</option>
          <option value="published">已发布</option>
          <option value="closed">关闭</option>
          <option value="cancelled">取消</option>
        </select>
      </div>
      <SessionEnrollmentScope v-model="enrollmentScope" input-id="session-create-scope" :school-id="organizationId" @valid="scopeValid = $event" />
      <p v-if="visibleError" class="form-error">{{ visibleError }}</p>
      <button type="submit" :disabled="submitting || catalogItems.length === 0 || schools.length === 0">
        {{ submitting ? "提交中..." : "新增团期" }}
      </button>
    </fieldset>
  </form>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"

import SessionEnrollmentScope from "./SessionEnrollmentScope.vue"
import type { EnrollmentScope, CatalogItem, School, TourSessionPayload } from "@/api/configuration"

const props = defineProps<{
  readonly catalogItems: readonly CatalogItem[]
  readonly formError: string
  readonly schools: readonly School[]
  readonly submitting: boolean
}>()

const emit = defineEmits<{
  create: [payload: TourSessionPayload]
}>()

const enrollmentScope = ref<EnrollmentScope>(null)
const scopeValid = ref(true)
const capacity = ref("")
const minimumParticipants = ref("")
const catalogItemId = ref("")
const code = ref("")
const endsAt = ref("")
const enrollmentClosesAt = ref("")
const enrollmentOpensAt = ref("")
const localError = ref("")
const organizationId = ref("")
watch(organizationId, () => { enrollmentScope.value = null })
const priceYuan = ref("")
const startsAt = ref("")
const status = ref("draft")

const visibleError = computed(() => localError.value || props.formError)

watch(
  () => props.schools,
  schools => {
    organizationId.value = organizationId.value || schools.at(0)?.id || ""
  },
  { immediate: true },
)

watch(
  () => props.catalogItems,
  items => {
    catalogItemId.value = catalogItemId.value || items.at(0)?.id || ""
  },
  { immediate: true },
)

function submit(): void {
  localError.value = ""
  if (!scopeValid.value) { localError.value = "请完成招生范围选择"; return }
  const priceFen = parsePriceFen(priceYuan.value)
  const capacityCount = Number(capacity.value)
  const minimumCount = minimumParticipants.value === "" ? null : Number(minimumParticipants.value)

  if (priceFen < 0) {
    localError.value = "团期价格不能为负数"
    return
  }

  if (!Number.isInteger(capacityCount) || capacityCount <= 0) {
    localError.value = "容量必须为正整数"
    return
  }

  if (minimumCount !== null && (!Number.isSafeInteger(minimumCount) || minimumCount <= 0 || minimumCount > capacityCount)) {
    localError.value = "最低人数须为不超过容量的正整数，留空可关闭"
    return
  }

  if (!formIsComplete()) {
    localError.value = "请选择学校和课程，并填写团期编码与日期"
    return
  }

  emit("create", {
    enrollmentScope: enrollmentScope.value,
    organizationId: organizationId.value,
    catalogItemId: catalogItemId.value,
    code: code.value,
    status: status.value,
    priceFen,
    capacity: capacityCount,
    minimumParticipants: minimumCount,
    startsAt: toIsoDate(startsAt.value),
    endsAt: toIsoDate(endsAt.value),
    enrollmentOpensAt: toIsoDate(enrollmentOpensAt.value),
    enrollmentClosesAt: toIsoDate(enrollmentClosesAt.value),
  })
}

function formIsComplete(): boolean {
  return [organizationId, catalogItemId, code, startsAt, endsAt, enrollmentOpensAt, enrollmentClosesAt].every(
    field => field.value !== "",
  )
}

function parsePriceFen(value: string): number {
  const yuan = Number(value)
  return Number.isFinite(yuan) ? Math.round(yuan * 100) : 0
}

function toIsoDate(value: string): string {
  return `${value}T00:00:00.000Z`
}
</script>
