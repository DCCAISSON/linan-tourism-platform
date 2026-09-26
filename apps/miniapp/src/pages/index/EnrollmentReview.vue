<script setup lang="ts">
import { computed } from "vue"
import { formatFen, type FamilyMember } from "../../enrollment-flow"
import type { useEnrollmentPage } from "./useEnrollmentPage"

const props = defineProps<{
  readonly page: ReturnType<typeof useEnrollmentPage>
}>()

const {
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
const hasSavedMembers = computed(() => selectedMembers.value.some((member) => member.remoteMemberId !== undefined))
function memberPlacement(member: FamilyMember): string {
  if (member.participantKind === "adult") {
    return "成人 · 无需年级班级"
  }
  if (member.remoteMemberId !== undefined) {
    return "学生 · 按家庭中心保存班级"
  }
  return `学生 · ${selectedGrade.value?.name ?? "年级待确认"} ${selectedClass.value?.name ?? "班级待确认"}`
}

function maskedIdentity(member: FamilyMember): string {
  const value = (member.identityNumber ?? "").trim()
  if (value.includes("*")) return value
  if (value.length <= 8) return value.length > 0 ? value : "已保存"
  return `${value.slice(0, 6)}********${value.slice(-4)}`
}

function maskedPhone(member: FamilyMember): string {
  const value = (member.phone ?? "").trim()
  if (value.includes("*")) return value
  if (value.length <= 7) return value.length > 0 ? value : "已保存"
  return `${value.slice(0, 3)}****${value.slice(-4)}`
}
</script>

<template>
  <view class="review-panel">
    <text class="review-panel__title">提交前核对</text>
    <text class="review-panel__item">学校：{{ selectedSchool?.name }}</text>
    <text v-if="hasSavedMembers" class="review-panel__item">已有成员按家庭中心保存的年级、班级报名。</text>
    <text class="review-panel__item">团期：{{ selectedSession?.code }}</text>
    <text class="review-panel__item">参与人数：{{ selectedMembers.length }} 人</text>
    <text v-for="(member, index) in selectedMembers" :key="member.id" class="review-panel__item">
      成员 {{ index + 1 }}：{{ member.displayName }}｜{{ memberPlacement(member) }}｜证件 {{ maskedIdentity(member) }}｜电话 {{ maskedPhone(member) }}
    </text>
    <text class="review-panel__item">预计金额：{{ estimatedAmount }}</text>
    <text class="review-panel__item">联系人：{{ draft.contactName }}</text>
    <text class="review-panel__item">紧急联系人：{{ draft.emergencyContact.name }}</text>
    <text class="review-panel__item">紧急联系电话：{{ draft.emergencyContact.phone }}</text>
    <text class="review-panel__item">协议：研学报名服务协议</text>
    <text class="review-panel__item">确认状态：已确认（第 1 版）</text>
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
