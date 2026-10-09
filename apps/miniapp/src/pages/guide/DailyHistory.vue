<script setup lang="ts">
import { dailyMealLabel, dailyMeals, type PersonDailyRevision } from "../../guide-daily-api"
import { displayTime } from "../../guide-execution-state"

defineProps<{ rows: readonly PersonDailyRevision[] }>()
</script>

<template>
  <view class="guide-section" aria-label="个人日报历史">
    <text class="guide-subtitle">日报历史</text>
    <text v-if="!rows.length" class="guide-muted">暂无历史版本，后续更正会保留原记录。</text>
    <view v-for="revision in rows" :key="revision.id" class="guide-row">
      <text class="guide-person-name">版本 {{ revision.version }} · {{ revision.correctionReason }}</text>
      <text class="guide-muted">{{ displayTime(revision.createdAt) }} · {{ revision.recordedByName }}</text>
      <text v-for="meal in dailyMeals" :key="meal.key" class="guide-note">{{ meal.label }}：{{ dailyMealLabel(revision[meal.key]) }}{{ revision[meal.note] ? ' · ' + revision[meal.note] : '' }}</text>
      <text v-if="revision.lodgingCheck" class="guide-note">历史住宿综合记录：{{ revision.lodgingCheck }}</text>
      <text v-if="revision.mealStatus" class="guide-note">历史餐饮综合记录：{{ revision.mealStatus }}</text>
      <text class="guide-muted">{{ revision.publicApproved ? '此版本摘要已批准' : '此版本摘要未批准' }}</text>
      <text v-if="revision.publicApproved && revision.publicSummary" class="guide-note">{{ revision.publicSummary }}</text>
    </view>
  </view>
</template>
