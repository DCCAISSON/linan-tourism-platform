<template>
  <details :id="id" :open="expanded" class="saved-catalog-preview" @toggle="toggle">
    <summary>查看已保存内容</summary>
    <div class="saved-catalog-preview__body">
      <p class="state-text">以下为已保存内容，供发布核对；实际页面请在小程序中查看。重新进入相应页面后显示更新。</p>
      <h4>{{ catalog.title }}</h4>
      <img v-if="catalog.coverImageUrl && !imageFailed" :src="catalog.coverImageUrl" :alt="`${catalog.title}封面`" @error="imageFailed = true" />
      <p v-else class="state-text">{{ catalog.coverImageUrl ? '封面暂无法加载，请检查已保存的图片链接。' : '尚未设置封面。' }}</p>
      <p>学校：{{ schoolLabel }}</p>
      <p class="saved-catalog-preview__description">{{ catalog.description || '尚未填写课程介绍。' }}</p>
      <p v-if="tourSessions.length === 0" class="state-text">尚无关联团期；请设置日期、价格与告知书，再核对报名条件。</p>
      <section v-for="session in tourSessions" :key="session.id" class="saved-catalog-preview__session">
        <h4><span>{{ session.code }}</span> · <span>{{ schoolName(session.organizationId) }}</span></h4>
        <p><span class="date-endpoint">{{ formatDate(session.startsAt) }}</span> 至 <span class="date-endpoint">{{ formatDate(session.endsAt) }}</span> · {{ statusText(session.status) }}</p>
        <p class="record-price">{{ formatFen(session.priceFen) }} / 人 · 学生、成人同价</p>
        <p>报名时间：<span class="date-endpoint">{{ formatDate(session.enrollmentOpensAt) }}</span> 至 <span class="date-endpoint">{{ formatDate(session.enrollmentClosesAt) }}</span></p>
        <template v-if="session.activeNotice">
          <h4>生效告知书：{{ session.activeNotice.title }}（{{ session.activeNotice.version }}）</h4>
          <p>目的地：{{ session.activeNotice.contentJson.destination }}</p>
          <p>集合地点：{{ session.activeNotice.contentJson.departurePlace }}</p>
          <p>餐食：{{ session.activeNotice.contentJson.mealNote }}</p>
          <h5>行程安排</h5>
          <ol><li v-for="(item, index) in session.activeNotice.contentJson.itinerary" :key="index">{{ item }}</li></ol>
          <h5>费用说明</h5>
          <p v-for="(item, index) in [...session.activeNotice.contentJson.unitPrices, ...session.activeNotice.contentJson.packageExamples]" :key="index">{{ item }}</p>
          <h5>报名须知</h5>
          <p v-for="(item, index) in session.activeNotice.contentJson.reminders" :key="index">{{ item }}</p>
        </template>
        <p v-else class="state-text">告知书未启用，家长暂不能报名。</p>
      </section>
    </div>
  </details>
</template>

<script setup lang="ts">
import { ref, watch } from "vue"
import type { CatalogItem, School, TourSession } from "@/api/configuration"
import { formatDate, formatFen, statusText } from "./format"

const props = withDefaults(defineProps<{
  readonly id: string
  readonly catalog: Pick<CatalogItem, "title" | "description" | "coverImageUrl">
  readonly schoolLabel: string
  readonly schools: readonly School[]
  readonly tourSessions: readonly TourSession[]
  readonly expanded?: boolean
}>(), { expanded: false })
const imageFailed = ref(false)
const emit = defineEmits<{ "update:expanded": [value: boolean] }>()
watch(() => props.catalog.coverImageUrl, () => { imageFailed.value = false })
function schoolName(id: string): string { return props.schools.find(school => school.id === id)?.name ?? "学校待核实" }
function toggle(event: Event): void {
  if (event.target instanceof HTMLDetailsElement) emit("update:expanded", event.target.open)
}
</script>

<style scoped>
.saved-catalog-preview { grid-column: 1 / -1; min-width: 0; font-size: var(--font-body-sm); }
.saved-catalog-preview summary { min-height: var(--size-touch-target); padding: var(--space-3) 0; color: var(--accent-primary); cursor: pointer; }
.saved-catalog-preview__body { padding: var(--space-4); background: var(--surface-elevated); overflow-wrap: anywhere; }
.saved-catalog-preview__body > img { display: block; width: 100%; max-width: calc(var(--space-10) * 5); aspect-ratio: 16 / 9; object-fit: cover; border-radius: var(--radius-control); }
.saved-catalog-preview h4, .saved-catalog-preview h5 { margin: var(--space-3) 0 var(--space-2); font-size: var(--font-body); }
.saved-catalog-preview p { margin: var(--space-2) 0; }
.saved-catalog-preview__description { white-space: pre-wrap; }
.saved-catalog-preview__session { margin-top: var(--space-4); border-top: 1px solid var(--border-subtle); }
.saved-catalog-preview__session h4 span { display: inline-block; max-width: 100%; }
.date-endpoint { display: inline-block; white-space: nowrap; }
.saved-catalog-preview__session ol { padding-left: var(--space-6); }
.saved-catalog-preview__session li { display: list-item; padding: 0; background: transparent; }
</style>
