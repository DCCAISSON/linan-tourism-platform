<script setup lang="ts">
import { computed, ref } from "vue"
import { formatDateLabel, formatFen } from "../../enrollment-flow"
import EnrollmentMembersSection from "./EnrollmentMembersSection.vue"
import type { useEnrollmentPage } from "./useEnrollmentPage"

const noticeExpanded = ref(false)
const props = defineProps<{
  readonly page: ReturnType<typeof useEnrollmentPage>
}>()
const page = props.page

const {
  schoolIndex, gradeIndex, classIndex, sessionIndex,
  gradeState, classState, gradeError, classError, retryGrades, retryClasses,
  availableSessions,
  catalog,
  classNames,
  contactFieldError,
  draft,
  gradeNames,
  onClassChange,
  onGradeChange,
  onSchoolChange,
  onSessionChange,
  phoneVerified,
  schoolNames,
  selectedClass,
  selectedGrade,
  selectedSchool,
  selectedSession,
  sessionNames,
} = page
const hasNewStudent = computed(() => draft.familyMembers.some((member) => member.selected && member.remoteMemberId === undefined && member.participantKind !== "adult"))
</script>

<template>
  <view class="section">
    <view class="section__header section__header--school">
      <text class="section__title">学校与班级</text>
      <text class="section__hint">选择学校后勾选参加人；已保存的学生沿用各自班级。</text>
      <text class="required-note"><text class="required-mark">*</text>学校必选；新增学生需选择年级和班级。</text>
    </view>

    <picker mode="selector" :range="schoolNames" :value="schoolIndex" :disabled="catalog.schools.length === 0" @change="onSchoolChange">
      <view id="enrollment-school-field" class="field-control">
        <text class="field-control__label"><text class="required-mark">*</text>学校</text>
        <text class="field-control__value">{{ selectedSchool?.name ?? "请选择学校" }}</text>
      </view>
    </picker>

    <text class="required-note">仅显示当前活动可报名的学校。</text>
    <template v-if="hasNewStudent">
    <picker mode="selector" :range="gradeNames" :value="gradeIndex" :disabled="gradeState !== 'ready'" @change="onGradeChange">
      <view id="enrollment-grade-field" class="field-control" :class="{ 'field-control--disabled': catalog.grades.length === 0 }">
        <text class="field-control__label">年级</text>
        <text class="field-control__value">{{ selectedGrade?.name ?? (gradeState === 'loading' ? '年级加载中…' : !draft.selectedSchoolId ? '请先选择学校' : '请选择年级') }}</text>
      </view>
    </picker>
    <view v-if="gradeState === 'error'" class="option-feedback">
      <text class="field-error">{{ gradeError }}</text>
      <button class="text-button" @tap="retryGrades">重试年级</button>
    </view>
    <text v-else-if="gradeState === 'empty'" class="required-note">该学校暂无可选年级，请联系活动工作人员。</text>

    <picker mode="selector" :range="classNames" :value="classIndex" :disabled="classState !== 'ready'" @change="onClassChange">
      <view id="enrollment-class-field" class="field-control" :class="{ 'field-control--disabled': catalog.classes.length === 0 }">
        <text class="field-control__label">班级</text>
        <text class="field-control__value">{{ selectedClass?.name ?? (classState === 'loading' ? '班级加载中…' : !draft.selectedGradeId ? '请先选择年级' : '请选择班级') }}</text>
      </view>
    </picker>
    <view v-if="classState === 'error'" class="option-feedback">
      <text class="field-error">{{ classError }}</text>
      <button class="text-button" @tap="retryClasses">重试班级</button>
    </view>
    <text v-else-if="classState === 'empty'" class="required-note">该年级暂无可选班级，请联系活动工作人员。</text>
    </template>
  </view>

  <EnrollmentMembersSection :page="page" />

  <view class="section">
    <text class="section__title">家长联系人</text>
    <text class="required-note"><text class="required-mark">*</text>为必填项，用于报名核对、保险登记和行前联系。</text>
    <view id="enrollment-contact-name-field" class="field-anchor">
      <view class="input-label input-label--block"><text class="required-mark">*</text>家长联系人姓名</view>
      <input v-model="draft.contactName" class="text-input text-input--block" maxlength="120" placeholder="请填写负责本次报名的家长姓名" placeholder-class="input-placeholder" />
      <text v-if="contactFieldError('contactName').length > 0" class="field-error">{{ contactFieldError('contactName') }}</text>
    </view>
    <view id="enrollment-contact-phone-field" class="field-anchor">
      <view class="input-label input-label--block"><text class="required-mark">*</text>家长手机</view>
      <input v-model="draft.contactPhone" class="text-input text-input--block" maxlength="11" type="number" placeholder="请输入11位手机号码" placeholder-class="input-placeholder" />
      <text class="required-note">用于报名确认和行前联系，学生联系电话也使用此号码。</text>
      <text v-if="phoneVerified" class="verified-note">请填写本次出行的联系手机号。</text>
      <text v-else class="required-note">手动填写号码不等同于已核验；请在下方完成手机号核验后再核对报名信息。</text>
      <text v-if="contactFieldError('contactPhone').length > 0" class="field-error">{{ contactFieldError('contactPhone') }}</text>
    </view>
  </view>

  <view id="enrollment-emergency-field" class="section emergency-contact-section">
    <text class="section__title">紧急联系人</text>
    <text class="section__hint">用于出行期间的紧急联系，请选择一位联系人。</text>
    <radio-group @change="draft.emergencySameAsParent = $event.detail.value === 'parent'">
      <label class="consent-button emergency-parent-choice" :class="{ 'consent-button--on': draft.emergencySameAsParent }">
        <radio class="choice-control" value="parent" :checked="draft.emergencySameAsParent" color="var(--accent-primary)" />
        <text>使用家长联系人</text>
      </label>
      <label class="consent-button emergency-other-choice" :class="{ 'consent-button--on': !draft.emergencySameAsParent }">
        <radio class="choice-control" value="other" :checked="!draft.emergencySameAsParent" color="var(--accent-primary)" />
        <text>添加其他紧急联系人</text>
      </label>
    </radio-group>
    <view v-if="draft.emergencySameAsParent" class="trip-detail">
      <text class="trip-line">姓名：{{ draft.contactName || "请先填写家长联系人姓名" }}</text>
      <text class="trip-line">电话：{{ draft.contactPhone || "请先填写家长手机" }}</text>
    </view>
    <view v-if="!draft.emergencySameAsParent" id="enrollment-emergency-name-field" class="field-anchor">
      <view class="input-label input-label--block"><text class="required-mark">*</text>紧急联系人姓名</view>
      <input v-model="draft.emergencyContact.name" class="text-input text-input--block" maxlength="120" placeholder="紧急联系人姓名" placeholder-class="input-placeholder" />
      <text v-if="contactFieldError('emergencyContactName').length > 0" class="field-error">{{ contactFieldError('emergencyContactName') }}</text>
    </view>
    <view v-if="!draft.emergencySameAsParent" id="enrollment-emergency-phone-field" class="field-anchor">
      <view class="input-label input-label--block"><text class="required-mark">*</text>紧急联系人电话</view>
      <input v-model="draft.emergencyContact.phone" class="text-input text-input--block" maxlength="11" type="number" placeholder="请输入11位手机号码" placeholder-class="input-placeholder" />
      <text v-if="contactFieldError('emergencyContactPhone').length > 0" class="field-error">{{ contactFieldError('emergencyContactPhone') }}</text>
    </view>
  </view>

  <view class="section">
    <text class="section__title">行程</text>
    <picker mode="selector" :range="sessionNames" :value="sessionIndex" :disabled="availableSessions.length === 0" @change="onSessionChange">
      <view id="enrollment-session-field" class="field-control" :class="{ 'field-control--disabled': availableSessions.length === 0 }">
        <text class="field-control__label"><text class="required-mark">*</text>可报名团期</text>
        <text class="field-control__value">{{ selectedSession?.code ?? "请选择团期" }}</text>
      </view>
    </picker>
    <view v-if="selectedSession" class="trip-detail">
      <text class="trip-line">日期：{{ formatDateLabel(selectedSession.startsAt) }} 至 {{ formatDateLabel(selectedSession.endsAt) }}</text>
      <text class="trip-line">{{ formatFen(selectedSession.priceFen) }} / 人 · 学生、成人同价</text>
      <text class="trip-line">报名：{{ formatDateLabel(selectedSession.enrollmentOpensAt) }} 至 {{ formatDateLabel(selectedSession.enrollmentClosesAt) }}</text>
    </view>
  </view>

  <view id="enrollment-agreement-field" class="section">
    <text class="section__title">报名须知</text>
    <view v-if="selectedSession?.activeNotice">
      <text class="section__hint">{{ selectedSession.activeNotice.title }} · {{ selectedSession.activeNotice.version }}</text>
      <button class="text-button" @tap="noticeExpanded = !noticeExpanded">{{ noticeExpanded ? "收起完整内容" : "查看完整内容" }}</button>
      <view v-if="noticeExpanded" class="trip-detail">
        <text class="trip-line">目的地：{{ selectedSession.activeNotice.contentJson.destination }}</text>
        <text class="trip-line">集合地点：{{ selectedSession.activeNotice.contentJson.departurePlace }}</text>
        <text class="trip-line">用餐说明：{{ selectedSession.activeNotice.contentJson.mealNote }}</text>
        <text class="input-label">行程安排</text>
        <text v-for="item in selectedSession.activeNotice.contentJson.itinerary" :key="item" class="trip-line">{{ item }}</text>
        <text class="input-label">费用说明</text>
        <text v-for="item in selectedSession.activeNotice.contentJson.unitPrices" :key="item" class="trip-line">{{ item }}</text>
        <text v-for="item in selectedSession.activeNotice.contentJson.packageExamples" :key="item" class="trip-line">{{ item }}</text>
        <text class="input-label">出行提醒</text>
        <text v-for="item in selectedSession.activeNotice.contentJson.reminders" :key="item" class="trip-line">{{ item }}</text>
      </view>
    </view>
    <text v-else class="section__hint">请先选择已发布告知书的团期。</text>
    <checkbox-group v-if="selectedSession?.activeNotice" @change="draft.agreementAccepted = $event.detail.value.includes('agreement')">
      <label class="consent-button enrollment-agreement-button" :class="{ 'consent-button--on': draft.agreementAccepted }">
        <checkbox class="choice-control" value="agreement" :checked="draft.agreementAccepted" color="var(--accent-primary)" />
        <text>我已阅读并同意《{{ selectedSession.activeNotice.title }}》</text>
      </label>
    </checkbox-group>
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

.section__header {
  display: flex;
  align-items: center;
}

.section__header {
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.section__header--school {
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
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
  background: var(--surface-secondary);
}

.field-control--disabled .field-control__value {
  color: var(--text-tertiary);
}

.option-feedback {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.section__header--school .section__title {
  padding-left: var(--space-2);
  border-left: var(--space-1) solid var(--brand-primary);
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
.verified-note { display: block; margin-top: 8px; color: var(--status-success); font-size: 12px; line-height: 1.4; }

.text-input {
  display: block;
  padding: 0 12px;
  color: var(--text-primary);
  font-size: 16px;
  line-height: 44px;
}

.text-input--block,
.trip-detail {
  margin-top: 12px;
}

.text-button,
.consent-button {
  min-height: 44px;
  margin: 0;
  border-radius: 8px;
  font-size: 16px;
  line-height: 44px;
}

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

.text-button::after {
  border: 0;
}

.section__header > .text-button {
  background: var(--accent-soft);
}

.consent-button {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  margin-top: var(--space-3);
  padding: var(--space-3);
  color: var(--text-secondary);
  line-height: 1.6;
  text-align: left;
}

.consent-button--on {
  color: var(--accent-primary);
  background: var(--accent-soft);
}

.choice-control {
  flex: 0 0 auto;
}

.consent-button > text {
  min-width: 0;
  overflow-wrap: anywhere;
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
