<script setup lang="ts">
import { formatDateLabel, formatFen } from "../../enrollment-flow"
import { memberFieldAnchor } from "../../enrollment-validation"
import type { useEnrollmentPage } from "./useEnrollmentPage"

const props = defineProps<{
  readonly page: ReturnType<typeof useEnrollmentPage>
}>()

const {
  addMember,
  availableSessions,
  catalog,
  classNames,
  contactFieldError,
  draft,
  gradeNames,
  memberFieldError,
  onClassChange,
  onGradeChange,
  onSchoolChange,
  onSessionChange,
  schoolNames,
  selectedClass,
  selectedGrade,
  selectedMembers,
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
      <text class="section__hint">先选学校；年级、班级用于新增成员，已有成员保留原班级。</text>
    </view>

    <picker mode="selector" :range="schoolNames" @change="onSchoolChange">
      <view id="enrollment-school-field" class="field-control">
        <text class="field-control__label">学校</text>
        <text class="field-control__value">{{ selectedSchool?.name ?? "请选择学校" }}</text>
      </view>
    </picker>

    <picker mode="selector" :range="gradeNames" :disabled="catalog.grades.length === 0" @change="onGradeChange">
      <view id="enrollment-grade-field" class="field-control" :class="{ 'field-control--disabled': catalog.grades.length === 0 }">
        <text class="field-control__label">年级</text>
        <text class="field-control__value">{{ selectedGrade?.name ?? "请选择年级" }}</text>
      </view>
    </picker>

    <picker mode="selector" :range="classNames" :disabled="catalog.classes.length === 0" @change="onClassChange">
      <view id="enrollment-class-field" class="field-control" :class="{ 'field-control--disabled': catalog.classes.length === 0 }">
        <text class="field-control__label">班级</text>
        <text class="field-control__value">{{ selectedClass?.name ?? "请选择班级" }}</text>
      </view>
    </picker>
  </view>

  <view id="enrollment-members-field" class="section">
    <view class="section__header">
      <view>
        <text class="section__title">参与成员</text>
        <text class="section__hint">已选择 {{ selectedMembers.length }} 人，可多人报名。</text>
        <text class="required-note"><text class="required-mark">*</text>为必填项，请填写参加人姓名、证件号码和联系电话。</text>
      </view>
      <button class="text-button" @tap="addMember">添加</button>
    </view>

    <view v-if="draft.familyMembers.length === 0" class="empty-line">
      <text>尚未添加参与成员。请添加学生或成人参与人后继续报名。</text>
    </view>

    <view v-for="member in draft.familyMembers" :key="member.id" class="member-row">
      <view class="member-row__fields">
        <view class="kind-toggle">
          <button class="kind-toggle__button" :class="{ 'kind-toggle__button--on': (member.participantKind ?? 'student') === 'student' }" :disabled="member.remoteMemberId !== undefined" @tap="member.participantKind = 'student'">学生</button>
          <button class="kind-toggle__button" :class="{ 'kind-toggle__button--on': member.participantKind === 'adult' }" :disabled="member.remoteMemberId !== undefined" @tap="member.participantKind = 'adult'">成人</button>
        </view>
        <view :id="memberFieldAnchor(member.id, 'displayName')" class="field-anchor">
          <view class="input-label"><text class="required-mark">*</text>姓名</view>
          <input v-model="member.displayName" :disabled="member.remoteMemberId !== undefined" class="text-input" maxlength="120" placeholder="请输入姓名" placeholder-class="input-placeholder" />
          <text v-if="memberFieldError(member, 'displayName').length > 0" class="field-error">{{ memberFieldError(member, 'displayName') }}</text>
        </view>
        <view :id="memberFieldAnchor(member.id, 'identityNumber')" class="field-anchor">
          <view class="input-label"><text class="required-mark">*</text>证件号码</view>
          <input v-model="member.identityNumber" :disabled="member.remoteMemberId !== undefined" class="text-input" maxlength="18" placeholder="请输入18位身份证号码" placeholder-class="input-placeholder" />
          <text v-if="memberFieldError(member, 'identityNumber').length > 0" class="field-error">{{ memberFieldError(member, 'identityNumber') }}</text>
        </view>
        <view :id="memberFieldAnchor(member.id, 'phone')" class="field-anchor">
          <view class="input-label"><text class="required-mark">*</text>联系电话</view>
          <input v-model="member.phone" :disabled="member.remoteMemberId !== undefined" class="text-input" maxlength="11" type="number" placeholder="请输入11位手机号码" placeholder-class="input-placeholder" />
          <text v-if="memberFieldError(member, 'phone').length > 0" class="field-error">{{ memberFieldError(member, 'phone') }}</text>
        </view>
        <text v-if="member.participantKind === 'adult'" class="member-row__hint">成人参与人无需选择年级和班级</text>
      </view>
      <button class="toggle-button" :class="{ 'toggle-button--on': member.selected }" @tap="toggleMember(member.id)">
        {{ member.selected ? "已选择" : "未选择" }}
      </button>
    </view>
  </view>

  <view class="section">
    <text class="section__title">联系人</text>
    <text class="required-note"><text class="required-mark">*</text>为必填项，用于报名核对、保险登记和行前联系。</text>
    <view id="enrollment-contact-name-field" class="field-anchor">
      <view class="input-label input-label--block"><text class="required-mark">*</text>家长联系人</view>
      <input v-model="draft.contactName" class="text-input text-input--block" maxlength="120" placeholder="家长联系人" placeholder-class="input-placeholder" />
      <text v-if="contactFieldError('contactName').length > 0" class="field-error">{{ contactFieldError('contactName') }}</text>
    </view>
    <view id="enrollment-emergency-name-field" class="field-anchor">
      <view class="input-label input-label--block"><text class="required-mark">*</text>紧急联系人姓名</view>
      <input v-model="draft.emergencyContact.name" class="text-input text-input--block" maxlength="120" placeholder="紧急联系人姓名" placeholder-class="input-placeholder" />
      <text v-if="contactFieldError('emergencyContactName').length > 0" class="field-error">{{ contactFieldError('emergencyContactName') }}</text>
    </view>
    <view id="enrollment-emergency-phone-field" class="field-anchor">
      <view class="input-label input-label--block"><text class="required-mark">*</text>紧急联系人电话</view>
      <input v-model="draft.emergencyContact.phone" class="text-input text-input--block" maxlength="11" type="number" placeholder="请输入11位手机号码" placeholder-class="input-placeholder" />
      <text v-if="contactFieldError('emergencyContactPhone').length > 0" class="field-error">{{ contactFieldError('emergencyContactPhone') }}</text>
    </view>
  </view>

  <view class="section">
    <text class="section__title">行程</text>
    <picker mode="selector" :range="sessionNames" :disabled="availableSessions.length === 0" @change="onSessionChange">
      <view id="enrollment-session-field" class="field-control" :class="{ 'field-control--disabled': availableSessions.length === 0 }">
        <text class="field-control__label">可报名团期</text>
        <text class="field-control__value">{{ selectedSession?.code ?? "请选择团期" }}</text>
      </view>
    </picker>
    <view v-if="selectedSession" class="trip-detail">
      <text class="trip-line">日期：{{ formatDateLabel(selectedSession.startsAt) }} 至 {{ formatDateLabel(selectedSession.endsAt) }}</text>
      <text class="trip-line">学校单价：{{ formatFen(selectedSession.priceFen) }}，人数上限：{{ selectedSession.capacity }} 人</text>
      <text class="trip-line">报名：{{ formatDateLabel(selectedSession.enrollmentOpensAt) }} 至 {{ formatDateLabel(selectedSession.enrollmentClosesAt) }}</text>
    </view>
  </view>

  <view id="enrollment-agreement-field" class="section">
    <text class="section__title">协议版本确认</text>
    <button class="consent-button" :class="{ 'consent-button--on': draft.agreementAccepted }" @tap="draft.agreementAccepted = !draft.agreementAccepted">
      {{ draft.agreementAccepted ? "已同意" : "阅读并同意" }}《研学报名服务协议》（第 1 版）
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
  display: block;
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


.input-label {
  display: block;
  margin: 10px 0 4px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.4;
}

.input-label--block {
  margin-top: 12px;
}

.required-mark {
  color: var(--status-error);
}

.required-note {
  display: block;
  margin-top: 8px;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.4;
}

.field-error {
  display: block;
  margin-top: 4px;
  color: var(--status-error);
  font-size: 12px;
  line-height: 1.4;
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
.trip-detail {
  margin-top: 12px;
}

.member-row {
  gap: 8px;
}

.member-row__fields {
  flex: 1 1 auto;
  min-width: 0;
}

.member-row__fields .text-input + .input-label {
  margin-top: 8px;
}
.kind-toggle {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.kind-toggle__button {
  min-height: 36px;
  margin: 0;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  color: var(--text-secondary);
  background: var(--surface-primary);
  font-size: 14px;
  line-height: 36px;
}

.kind-toggle__button--on {
  color: var(--accent-primary);
  border-color: var(--accent-primary);
  background: var(--accent-soft);
}

.member-row__hint {
  display: block;
  margin-top: 8px;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.4;
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
  padding: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
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
