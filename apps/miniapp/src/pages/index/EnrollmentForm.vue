<script setup lang="ts">
import { formatDateLabel } from "../../enrollment-flow"
import type { useEnrollmentPage } from "./useEnrollmentPage"

const props = defineProps<{
  readonly page: ReturnType<typeof useEnrollmentPage>
}>()

const {
  FAMILY_ENROLLMENT_AGREEMENT_VERSION,
  addMember,
  availableSessions,
  catalog,
  classNames,
  draft,
  gradeNames,
  onClassChange,
  onGradeChange,
  onSchoolChange,
  onSessionChange,
  schoolNames,
  selectedClass,
  selectedGrade,
  selectedSchool,
  selectedSession,
  sessionNames,
  toggleMember,
} = props.page
</script>

<template>
  <view class="section">
    <view class="section__header">
      <text class="section__title">学校与班级</text>
      <text class="section__hint">请选择学生所在学校</text>
    </view>

    <picker mode="selector" :range="schoolNames" @change="onSchoolChange">
      <view class="field-control">
        <text class="field-control__label">学校</text>
        <text class="field-control__value">{{ selectedSchool?.name ?? "请选择学校" }}</text>
      </view>
    </picker>

    <picker mode="selector" :range="gradeNames" :disabled="catalog.grades.length === 0" @change="onGradeChange">
      <view class="field-control" :class="{ 'field-control--disabled': catalog.grades.length === 0 }">
        <text class="field-control__label">年级</text>
        <text class="field-control__value">{{ selectedGrade?.name ?? "请选择年级" }}</text>
      </view>
    </picker>

    <picker mode="selector" :range="classNames" :disabled="catalog.classes.length === 0" @change="onClassChange">
      <view class="field-control" :class="{ 'field-control--disabled': catalog.classes.length === 0 }">
        <text class="field-control__label">班级</text>
        <text class="field-control__value">{{ selectedClass?.name ?? "请选择班级" }}</text>
      </view>
    </picker>
  </view>

  <view class="section">
    <view class="section__header">
      <text class="section__title">家庭成员</text>
      <button class="text-button" @tap="addMember">添加</button>
    </view>

    <view v-if="draft.familyMembers.length === 0" class="empty-line">
      <text>尚未添加家庭成员。添加后可选择多人参加。</text>
    </view>

    <view v-for="member in draft.familyMembers" :key="member.id" class="member-row">
      <view class="member-row__fields">
        <input v-model="member.code" class="text-input" maxlength="64" placeholder="成员编号" placeholder-class="input-placeholder" />
        <input v-model="member.displayName" class="text-input" maxlength="120" placeholder="成员称呼" placeholder-class="input-placeholder" />
      </view>
      <button
        class="toggle-button"
        :class="{ 'toggle-button--on': member.selected }"
        @tap="toggleMember(member.id)"
      >
        {{ member.selected ? "已选择" : "未选择" }}
      </button>
    </view>
  </view>

  <view class="section">
    <text class="section__title">联系人</text>
    <input v-model="draft.contactName" class="text-input text-input--block" maxlength="120" placeholder="家长联系人姓名" placeholder-class="input-placeholder" />
    <input
      v-model="draft.emergencyContact.name"
      class="text-input text-input--block"
      maxlength="120"
      placeholder="紧急联系人姓名"
      placeholder-class="input-placeholder"
    />
    <input
      v-model="draft.emergencyContact.phone"
      class="text-input text-input--block"
      maxlength="32"
      type="number"
      placeholder="紧急联系人电话"
      placeholder-class="input-placeholder"
    />
  </view>

  <view class="section">
    <text class="section__title">团期</text>
    <picker mode="selector" :range="sessionNames" :disabled="availableSessions.length === 0" @change="onSessionChange">
      <view class="field-control" :class="{ 'field-control--disabled': availableSessions.length === 0 }">
        <text class="field-control__label">可报名团期</text>
        <text class="field-control__value">{{ selectedSession?.code ?? "请选择团期" }}</text>
      </view>
    </picker>
    <view v-if="selectedSession" class="trip-line">
      <text>{{ formatDateLabel(selectedSession.startsAt) }} 至 {{ formatDateLabel(selectedSession.endsAt) }}</text>
    </view>
  </view>

  <view class="section">
    <text class="section__title">协议版本确认</text>
    <button
      class="consent-button"
      :class="{ 'consent-button--on': draft.agreementAccepted }"
      @tap="draft.agreementAccepted = !draft.agreementAccepted"
    >
      {{ draft.agreementAccepted ? "已确认" : "点击确认" }} {{ FAMILY_ENROLLMENT_AGREEMENT_VERSION }}
    </button>
  </view>
</template>

<style scoped>
.section {
  box-sizing: border-box;
  margin-top: 24px;
  padding: 20px;
  border-radius: 8px;
  background: var(--surface-elevated);
}

.section__header,
.member-row {
  display: flex;
  align-items: center;
}

.section__header {
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.section__title {
  display: block;
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 600;
  line-height: 1.4;
}

.section__hint,
.trip-line {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.field-control,
.text-input,
.consent-button {
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--surface-primary);
}

.field-control {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 12px;
  padding: 12px;
}

.field-control--disabled {
  opacity: 0.5;
}

.field-control__label {
  flex: 0 0 auto;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.field-control__value {
  min-width: 0;
  color: var(--text-primary);
  font-size: 16px;
  line-height: 1.5;
  text-align: right;
  overflow-wrap: anywhere;
}

.text-input {
  display: block;
  padding: 0 12px;
  color: var(--text-primary);
  font-size: 16px;
  line-height: 44px;
}

.text-input--block,
.member-row,
.trip-line {
  margin-top: 12px;
}

.member-row {
  gap: 8px;
}

.member-row__fields {
  flex: 1 1 auto;
  min-width: 0;
}

.member-row__fields .text-input + .text-input {
  margin-top: 8px;
}

.toggle-button,
.text-button,
.consent-button {
  min-height: 44px;
  margin: 0;
  border-radius: 8px;
  font-size: 16px;
  line-height: 44px;
}

.toggle-button {
  flex: 0 0 88px;
  min-width: 0;
  color: var(--text-secondary);
  background: var(--surface-secondary);
}

.toggle-button--on,
.consent-button--on {
  color: var(--accent-primary);
  border-color: var(--accent-primary);
  background: var(--surface-secondary);
}

.text-button {
  flex: 0 0 auto;
  min-width: 64px;
  padding: 0 12px;
  color: var(--accent-primary);
  background: transparent;
}

.consent-button {
  margin-top: 12px;
  color: var(--text-secondary);
  text-align: left;
}

.empty-line {
  display: block;
  margin-top: 8px;
  color: var(--text-secondary);
  font-size: 16px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
</style>
