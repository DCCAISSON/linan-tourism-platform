<script setup lang="ts">
import EnrollmentForm from "./EnrollmentForm.vue"
import EnrollmentReview from "./EnrollmentReview.vue"
import EnrollmentStatePanel from "./EnrollmentStatePanel.vue"
import { useEnrollmentPage } from "./useEnrollmentPage"

const page = useEnrollmentPage()
const {
  FAMILY_ENROLLMENT_AGREEMENT_VERSION,
  backToEdit,
  canReview,
  canSubmit,
  enterReview,
  errorMessage,
  loadCatalog,
  loadState,
  loadStateLabel,
  pageMode,
  readiness,
  submissionCode,
  submitEnrollment,
} = page
</script>

<template>
  <view class="page">
    <view class="topbar">
      <view class="state-pill">
        <view class="state-pill__dot" />
        <text class="state-pill__text">{{ loadStateLabel }}</text>
      </view>
      <text class="topbar__version">{{ FAMILY_ENROLLMENT_AGREEMENT_VERSION }}</text>
    </view>

    <view class="hero">
      <text class="hero__eyebrow">家长小程序</text>
      <text class="hero__title flow-title">报名信息核对</text>
      <text class="hero__summary">选择家庭成员与学校班级，核对紧急联系人和协议版本后提交。</text>
    </view>

    <EnrollmentStatePanel v-if="loadState === 'loading'" kind="loading" />
    <EnrollmentStatePanel v-else-if="loadState === 'empty'" kind="empty" @retry="loadCatalog" />
    <EnrollmentStatePanel
      v-else-if="loadState === 'error'"
      kind="error"
      :message="errorMessage"
      @retry="loadCatalog"
    />

    <view v-else class="content">
      <view v-if="errorMessage.length > 0" class="inline-error" aria-live="polite">
        <text>{{ errorMessage }}</text>
      </view>

      <EnrollmentForm v-if="pageMode !== 'submitted'" :page="page" />
      <EnrollmentReview v-if="pageMode === 'review' || pageMode === 'submitting'" :page="page" />
      <EnrollmentStatePanel
        v-if="pageMode === 'submitted'"
        kind="success"
        :submission-code="submissionCode"
      />

      <view v-if="pageMode !== 'submitted'" class="bottom-actions">
        <button v-if="pageMode === 'review'" class="secondary-button" @tap="backToEdit">返回修改</button>
        <button
          v-if="pageMode === 'editing'"
          class="primary-button"
          :disabled="!canReview"
          @tap="enterReview"
        >
          核对信息
        </button>
        <button
          v-else
          class="primary-button"
          :disabled="!canSubmit || pageMode === 'submitting'"
          @tap="submitEnrollment"
        >
          {{ pageMode === "submitting" ? "提交中" : "确认提交" }}
        </button>
      </view>

      <view v-if="!readiness.ready && pageMode === 'editing'" class="readiness-line">
        <text>{{ readiness.reason }}</text>
      </view>
    </view>
  </view>
</template>

<style scoped>
.page {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 32px 16px 112px;
  overflow-x: hidden;
  background: var(--surface-primary);
}

.topbar,
.bottom-actions {
  display: flex;
  align-items: center;
}

.topbar {
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.state-pill {
  display: flex;
  align-items: center;
  min-height: 44px;
  gap: 8px;
}

.state-pill__dot {
  width: 8px;
  height: 8px;
  border-radius: 8px;
  background: var(--status-success);
}

.state-pill__text,
.topbar__version,
.readiness-line {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.4;
}

.topbar__version {
  max-width: 180px;
  min-width: 0;
  text-align: right;
  overflow-wrap: anywhere;
}

.hero {
  margin-top: 24px;
}

.hero__eyebrow {
  display: block;
  color: var(--accent-warm);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
}

.hero__title {
  display: block;
  margin-top: 8px;
  color: var(--text-primary);
  font-size: 32px;
  font-weight: 700;
  line-height: 1.2;
}

.hero__summary {
  display: block;
  margin-top: 12px;
  color: var(--text-secondary);
  font-size: 17px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.content {
  margin-top: 24px;
}

.inline-error {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  padding: 12px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  color: var(--status-error);
  background: var(--surface-secondary);
}

.bottom-actions {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  box-sizing: border-box;
  gap: 12px;
  padding: 12px 16px 24px;
  border-top: 1px solid var(--border-subtle);
  background: var(--surface-elevated);
}

.primary-button,
.secondary-button {
  flex: 1 1 0;
  min-width: 0;
  min-height: 44px;
  margin: 0;
  border-radius: 8px;
  font-size: 16px;
  line-height: 44px;
}

.primary-button {
  color: var(--surface-elevated);
  background: var(--accent-primary);
}

.secondary-button {
  color: var(--accent-primary);
  background: var(--surface-secondary);
}

.primary-button[disabled],
.secondary-button[disabled] {
  opacity: 0.5;
}

.readiness-line {
  margin-top: 12px;
}
</style>
