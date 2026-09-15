<script setup lang="ts">
import { computed } from "vue"
import { formatFen } from "../../enrollment-flow"
import type { useEnrollmentPage } from "./useEnrollmentPage"

const props = defineProps<{
  readonly page: ReturnType<typeof useEnrollmentPage>
}>()

const {
  FAMILY_ENROLLMENT_AGREEMENT_VERSION,
  draft,
  selectedClass,
  selectedGrade,
  selectedMembers,
  selectedSchool,
  selectedSession,
} = props.page

const estimatedAmount = computed(() => {
  if (selectedSession.value === undefined) {
    return "待确认"
  }
  return formatFen(selectedSession.value.priceFen * selectedMembers.value.length)
})
</script>

<template>
  <view class="review-panel">
    <text class="review-panel__title">提交前核对</text>
    <text class="review-panel__item">学校：{{ selectedSchool?.name }}</text>
    <text class="review-panel__item">班级：{{ selectedGrade?.name }} {{ selectedClass?.name }}</text>
    <text class="review-panel__item">团期：{{ selectedSession?.code }}</text>
    <text class="review-panel__item">成员：{{ selectedMembers.length }} 人</text>
    <text class="review-panel__item">预计金额：{{ estimatedAmount }}</text>
    <text class="review-panel__item">联系人：{{ draft.contactName }}</text>
    <text class="review-panel__item">紧急联系人：{{ draft.emergencyContact.name }}</text>
    <text class="review-panel__item">协议：{{ FAMILY_ENROLLMENT_AGREEMENT_VERSION }}</text>
  </view>
</template>

<style scoped>
.review-panel {
  box-sizing: border-box;
  margin-top: 24px;
  padding: 20px;
  border-radius: 8px;
  background: var(--surface-elevated);
}

.review-panel__title {
  display: block;
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 600;
  line-height: 1.4;
}

.review-panel__item {
  display: block;
  margin-top: 8px;
  color: var(--text-primary);
  font-size: 16px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
</style>
