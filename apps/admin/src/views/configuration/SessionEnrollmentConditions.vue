<template>
  <div class="session-enrollment-conditions">
    <strong>报名条件核对</strong>
    <p>{{ courseCondition }}；{{ publicationCondition }}；{{ session.activeNotice ? '告知书已启用' : '告知书未启用' }}。</p>
    <p>{{ timeCondition }}；{{ capacityCondition }}。</p>
    <small class="state-text">按当前已读取数据核对，名额以报名时核验为准。</small>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import type { CatalogItem, TourSession } from "@/api/configuration"
const props = defineProps<{ readonly catalog: CatalogItem | undefined; readonly session: TourSession; readonly now: number }>()
const courseCondition = computed(() => {
  switch (props.catalog?.status) {
    case "active": return "课程已启用"
    case "draft": case "disabled": return "课程未启用"
    default: return "课程状态待核实"
  }
})
const publicationCondition = computed(() => {
  switch (props.session.status) {
    case "published": return "团期已发布"
    case "draft": return "团期待发布"
    case "closed": return "报名已关闭，课程启用时家长仍可浏览"
    case "cancelled": return "团期已取消"
    default: return "团期状态待核实"
  }
})
const timeCondition = computed(() => {
  const opens = Date.parse(props.session.enrollmentOpensAt)
  const closes = Date.parse(props.session.enrollmentClosesAt)
  if (!Number.isFinite(opens) || !Number.isFinite(closes) || closes < opens) return "报名时间待核实"
  if (props.now < opens) return "报名尚未开始"
  return props.now > closes ? "报名已截止" : "在报名时间内"
})
const capacityCondition = computed(() => {
  const { capacity, occupiedCapacity } = props.session
  if (capacity <= 0) return "名额待核实（容量暂未提供）"
  if (occupiedCapacity == null) return `名额待核实（已付款有效人数暂未提供，容量 ${capacity} 人）`
  const remaining = Math.max(0, capacity - occupiedCapacity)
  return `${remaining === 0 ? '已满额' : `剩余 ${remaining} 个名额`}（已付款有效人数 ${occupiedCapacity} / 容量 ${capacity} 人）`
})
</script>

<style scoped>
.session-enrollment-conditions { grid-column: 1 / -1; padding-top: var(--space-2); border-top: 1px solid var(--border-default); font-size: var(--font-body-sm); }
.session-enrollment-conditions p { margin: var(--space-1) 0; color: var(--text-secondary); }
</style>
