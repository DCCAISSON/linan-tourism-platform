<script setup lang="ts">
import { computed, nextTick } from "vue"
import { formatDateLabel, formatFen, type FamilyMember } from "../../enrollment-flow"
import { memberFieldAnchor } from "../../enrollment-validation"
import type { useEnrollmentPage } from "./useEnrollmentPage"

const props = defineProps<{
  readonly page: ReturnType<typeof useEnrollmentPage>
}>()

const {
  draft,
  backToEdit,
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
const adultCount = computed(() => selectedMembers.value.filter((member) => member.participantKind === "adult").length)
const studentCount = computed(() => selectedMembers.value.length - adultCount.value)
async function editSection(anchor: string): Promise<void> {
  backToEdit()
  await nextTick()
  uni.pageScrollTo({ selector: `#${anchor}`, duration: 200 })
}
function memberPlacement(member: FamilyMember): string {
  if (member.participantKind === "adult") {
    return "成人 · 无需年级班级"
  }
  if (member.fromCommonList) {
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
  const value = (member.participantKind === "adult" && member.phone ? member.phone : draft.contactPhone).trim()
  if (value.includes("*")) return value
  if (value.length <= 7) return value.length > 0 ? value : "已保存"
  return `${value.slice(0, 3)}****${value.slice(-4)}`
}
</script>

<template>
  <view class="review-panel">
    <text class="review-panel__title">提交前核对</text>
    <view class="review-group">
      <view class="review-heading"><text class="review-group__title">团期与学校</text><button class="review-edit" @tap="editSection('enrollment-session-field')">修改行程</button></view>
      <text class="review-panel__item">团期：{{ selectedSession?.code }}</text>
      <text v-if="selectedSession" class="review-panel__item">日期：{{ formatDateLabel(selectedSession.startsAt) }} 至 {{ formatDateLabel(selectedSession.endsAt) }}</text>
      <view class="review-heading"><text class="review-panel__item">学校：{{ selectedSchool?.name ?? '无需选择学校' }}</text><button class="review-edit" @tap="editSection('enrollment-school-field')">修改学校</button></view>
    </view>
    <view class="review-group">
      <view class="review-heading"><text class="review-group__title">参加人员 · {{ selectedMembers.length }} 人</text><button class="review-edit" @tap="editSection('enrollment-members-field')">修改人员</button></view>
      <view v-for="(member, index) in selectedMembers" :key="member.id" class="review-member">
        <view class="review-heading"><text class="review-member__name">{{ index + 1 }}. {{ member.displayName }}</text><button class="review-edit" @tap="editSection(memberFieldAnchor(member.id, 'displayName'))">修改</button></view>
        <text class="review-panel__item">{{ memberPlacement(member) }}</text>
        <text class="review-panel__item">证件：{{ maskedIdentity(member) }}</text>
        <text class="review-panel__item">电话：{{ maskedPhone(member) }}</text>
        <view class="health-review-state" :data-member-id="member.id">
          <text>健康备注：{{ !member.healthNotes?.trim() ? '未填写' : member.healthConsent ? '已单独授权，将随本次报名保存' : '未授权，不随报名提交' }}</text>
          <text v-if="member.healthNotes?.trim()" class="review-health-notes">{{ member.healthNotes }}</text>
        </view>
      </view>
    </view>
    <view class="review-group">
      <view class="review-heading"><text class="review-group__title">联系信息</text><button class="review-edit" @tap="editSection('enrollment-contact-name-field')">修改联系人</button></view>
      <text class="review-panel__item">家长联系人：{{ draft.contactName }} · {{ draft.contactPhone }}</text>
      <view class="review-heading"><text class="review-panel__item">紧急联系人</text><button class="review-edit" @tap="editSection('enrollment-emergency-field')">修改紧急联系</button></view>
      <text class="review-panel__item">{{ draft.emergencySameAsParent ? draft.contactName : draft.emergencyContact.name }} · {{ draft.emergencySameAsParent ? draft.contactPhone : draft.emergencyContact.phone }}</text>
    </view>
    <view class="review-group review-fees">
      <text class="review-group__title">费用明细</text>
      <template v-if="selectedSession">
        <text class="review-fee-note">学生、成人同价，按报名人数计费</text>
        <view v-if="studentCount > 0" class="review-fee-row"><text>学生 {{ studentCount }} 人 × {{ formatFen(selectedSession.priceFen) }}</text><text>{{ formatFen(studentCount * selectedSession.priceFen) }}</text></view>
        <view v-if="adultCount > 0" class="review-fee-row"><text>成人 {{ adultCount }} 人 × {{ formatFen(selectedSession.priceFen) }}</text><text>{{ formatFen(adultCount * selectedSession.priceFen) }}</text></view>
      </template>
      <view class="review-heading review-fee-total"><text class="review-group__title">合计 · {{ selectedMembers.length }} 人</text><text class="review-amount">{{ estimatedAmount }}</text></view>
    </view>
    <view class="review-group">
      <view class="review-heading"><text class="review-group__title">报名须知</text><button class="review-edit" @tap="editSection('enrollment-agreement-field')">查看须知</button></view>
      <text class="review-panel__item">{{ selectedSession?.activeNotice?.title }}</text>
      <text class="review-panel__item">已确认（{{ selectedSession?.activeNotice?.version }}）</text>
    </view>
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
.health-review-state { margin-top: var(--space-2); color: var(--text-secondary); font-size: var(--font-body-sm); line-height: 1.5; overflow-wrap: anywhere; }
.review-group { margin-top: var(--space-5); padding-top: var(--space-4); border-top: 1px solid var(--border-subtle); }
.review-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.review-heading > text { min-width: 0; overflow-wrap: anywhere; }
.review-group__title, .review-member__name { color: var(--text-primary); font-size: var(--font-body); font-weight: 600; }
.review-edit { flex: 0 0 auto; min-height: var(--size-touch-target); margin: 0; padding: 0 var(--space-2); color: var(--accent-primary); background: transparent; font-size: var(--font-body-sm); line-height: var(--size-touch-target); }
.review-edit::after { border: 0; }
.review-member { margin-top: var(--space-3); padding-bottom: var(--space-3); }
.review-member + .review-member { border-top: 1px solid var(--border-subtle); padding-top: var(--space-3); }
.review-fees { padding: var(--space-4); border: 0; border-radius: var(--radius-control); background: var(--surface-secondary); }
.review-fee-note { display: block; margin-top: var(--space-2); color: var(--text-secondary); font-size: var(--font-body-sm); line-height: 1.5; }
.review-fee-row { display: flex; justify-content: space-between; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-3); color: var(--text-primary); font-size: var(--font-body-sm); line-height: 1.5; font-variant-numeric: tabular-nums; }
.review-fee-total { margin-top: var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--border-default); }
.review-health-notes { display: block; margin-top: var(--space-2); white-space: pre-wrap; }
.review-amount { color: var(--accent-warm); font-size: var(--font-h2); font-weight: 700; font-variant-numeric: tabular-nums; }
</style>
