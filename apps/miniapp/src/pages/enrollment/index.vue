<script setup lang="ts">
import WechatConsent from "../../components/WechatConsent.vue"
import EnrollmentForm from "../index/EnrollmentForm.vue"
import EnrollmentReview from "../index/EnrollmentReview.vue"
import EnrollmentStatePanel from "../index/EnrollmentStatePanel.vue"
import OrderStatusPanel from "../index/OrderStatusPanel.vue"
import { useEnrollmentPage } from "../index/useEnrollmentPage"

const page = useEnrollmentPage()
const {
  authenticated, completeLogin, loginRequested, requestLogin, cancelLogin, validationShown, selectedSession,
  backToEdit,
  canSubmit,
  enterReview,
  errorMessage,
  loadCatalog,
  loadState,
  loadStateLabel,
  pageMode,
  readiness,
  stateTone,
  submitEnrollment,
} = page
</script>

<template>
  <view class="page">
    <view class="topbar">
      <view class="state-pill">
        <view class="state-pill__dot" :class="`state-pill__dot--${stateTone}`" />
        <text class="state-pill__text">{{ loadStateLabel }}</text>
      </view>
      <text v-if="selectedSession?.activeNotice" class="topbar__version">告知书 {{ selectedSession.activeNotice.version }}</text>
    </view>

    <view class="hero">
      <text class="hero__title flow-title">研学报名</text>
      <text class="hero__summary">选择行程和参加人，核对信息后提交报名。</text>
    </view>

    <view class="flow-stepper" aria-label="报名步骤">
      <view class="flow-step" :class="{ 'flow-step--active': pageMode === 'editing' }">
        <text class="flow-step__index">1</text>
        <text class="flow-step__label">行程</text>
      </view>
      <view class="flow-step" :class="{ 'flow-step--active': pageMode === 'review' || pageMode === 'submitting' }">
        <text class="flow-step__index">2</text>
        <text class="flow-step__label">核对</text>
      </view>
      <view class="flow-step" :class="{ 'flow-step--active': pageMode === 'paymentPending' }">
        <text class="flow-step__index">3</text>
        <text class="flow-step__label">确认</text>
      </view>
      <view class="flow-step" :class="{ 'flow-step--active': pageMode === 'paid' }">
        <text class="flow-step__index">4</text>
        <text class="flow-step__label">完成</text>
      </view>
    </view>

    <EnrollmentStatePanel v-if="loadState === 'loading'" kind="loading" />
    <EnrollmentStatePanel v-else-if="loadState === 'empty'" kind="empty" @retry="loadCatalog" />
    <EnrollmentStatePanel v-else-if="loadState === 'error'" kind="error" :message="errorMessage" @retry="loadCatalog" />

    <view v-else class="content">
      <view v-if="!authenticated && pageMode === 'editing'" id="enrollment-login-field">
        <view v-if="loginRequested">
          <WechatConsent title="确认身份，保存本次报名" login-label="同意并继续" @authenticated="completeLogin" />
          <button class="secondary-button" @tap="cancelLogin">返回继续填写</button>
        </view>
        <button v-else class="secondary-button" @tap="requestLogin">使用已保存的参加人</button>
      </view>
      <view v-if="errorMessage.length > 0 && pageMode !== 'paymentPending' && pageMode !== 'paid'" class="inline-error" aria-live="polite">
        <text>{{ errorMessage }}</text>
      </view>

      <EnrollmentForm v-if="pageMode === 'editing'" :page="page" />
      <EnrollmentReview v-if="pageMode === 'review' || pageMode === 'submitting'" :page="page" />
      <OrderStatusPanel v-if="pageMode === 'paymentPending' || pageMode === 'paid'" :page="page" />

      <view v-if="!loginRequested && (pageMode === 'editing' || pageMode === 'review' || pageMode === 'submitting')" class="bottom-actions">
        <button v-if="pageMode === 'review'" class="secondary-button" @tap="backToEdit">返回修改</button>
        <button v-if="pageMode === 'editing'" class="primary-button" @tap="enterReview">
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

      <view v-if="validationShown && !readiness.ready && pageMode === 'editing'" class="readiness-line">
        <text>{{ readiness.reason }}</text>
      </view>
    </view>
  </view>
</template>

<style scoped>
.page {
  min-height: 100dvh;
  box-sizing: border-box;
  padding: 32px 16px 112px;
  overflow-x: hidden;
  background: var(--surface-primary);
}

.topbar,
.bottom-actions,
.flow-stepper,
.flow-step {
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
}

.state-pill__dot--success {
  background: var(--status-success);
}

.state-pill__dot--warning {
  background: var(--status-warning);
}

.state-pill__dot--error {
  background: var(--status-error);
}

.state-pill__dot--info {
  background: var(--status-info);
}

.state-pill__text,
.topbar__version,
.readiness-line,
.flow-step__label {
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

.flow-stepper {
  gap: 8px;
  margin-top: 24px;
}

.flow-step {
  flex: 1 1 0;
  min-width: 0;
  gap: 6px;
  min-height: 44px;
  padding: 0 8px;
  border-radius: 8px;
  background: var(--surface-secondary);
}

.flow-step--active {
  background: var(--surface-elevated);
}

.flow-step__index {
  flex: 0 0 20px;
  height: 20px;
  border-radius: 20px;
  color: var(--surface-elevated);
  font-size: 12px;
  line-height: 20px;
  text-align: center;
  background: var(--accent-primary);
}

.flow-step__label {
  min-width: 0;
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
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
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
