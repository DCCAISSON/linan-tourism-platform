<script setup lang="ts">
import ProfileLoginSheet from "../../components/ProfileLoginSheet.vue"
import ServiceConsent from "../../components/ServiceConsent.vue"
import EnrollmentForm from "../index/EnrollmentForm.vue"
import EnrollmentReview from "../index/EnrollmentReview.vue"
import EnrollmentStatePanel from "../index/EnrollmentStatePanel.vue"
import OrderStatusPanel from "../index/OrderStatusPanel.vue"
import { useEnrollmentPage } from "../index/useEnrollmentPage"

const page = useEnrollmentPage()
const {
  draftStatus, clearCurrentDraft,
  healthState, healthNeedsLogin, healthMessage, retryHealthNotes, openHealthOrder,
  loginPromptVisible,
  serviceConsentVisible, completeServiceConsent, cancelServiceConsent,
  authenticated, adoptLoginDraft, completeLogin, loginRequested, requestLogin, cancelLogin, validationShown, selectedSession,
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
    <ServiceConsent v-if="serviceConsentVisible" required @accepted="completeServiceConsent" @declined="cancelServiceConsent" />
    <ProfileLoginSheet v-if="loginPromptVisible || loginRequested" @completed="(response, phone) => { adoptLoginDraft(response, phone); completeLogin(response) }" @cancelled="cancelLogin" />
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
        <text class="flow-step__label"><text class="flow-step__phrase">填写</text><text class="flow-step__phrase">资料</text></text>
      </view>
      <view class="flow-step" :class="{ 'flow-step--active': pageMode === 'review' || pageMode === 'submitting' }">
        <text class="flow-step__index">2</text>
        <text class="flow-step__label"><text class="flow-step__phrase">核对</text><text class="flow-step__phrase">信息</text></text>
      </view>
      <view class="flow-step" :class="{ 'flow-step--active': pageMode === 'paymentPending' }">
        <text class="flow-step__index">3</text>
        <text class="flow-step__label">支付</text>
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
        <button class="secondary-button" @tap="requestLogin">使用已保存的参加人</button>
      </view>
      <view v-if="errorMessage.length > 0 && pageMode !== 'paymentPending' && pageMode !== 'paid'" class="inline-error" aria-live="polite">
        <text>{{ errorMessage }}</text>
      </view>

      <EnrollmentForm v-if="pageMode === 'editing'" :page="page" />
      <text v-if="draftStatus && (pageMode === 'editing' || pageMode === 'review')" class="draft-error" aria-live="polite">{{ draftStatus }}</text>
      <button v-if="pageMode === 'editing'" class="draft-clear" @tap="clearCurrentDraft">清除已填信息</button>
      <EnrollmentReview v-if="pageMode === 'review' || pageMode === 'submitting'" :page="page" />
      <view v-if="healthState !== 'idle' && (pageMode === 'paymentPending' || pageMode === 'paid')" class="health-save-state" aria-live="polite">
        <text class="health-save-title">{{ healthState === 'saved' ? '健康备注已保存' : healthState === 'saving' ? '保存健康备注' : '报名已提交，健康备注待保存' }}</text>
        <text class="health-save-message">{{ healthMessage }}</text>
        <view v-if="healthState === 'error'">
          <button v-if="healthNeedsLogin" class="primary-button health-login-button" @tap="retryHealthNotes">重新登录并保存</button>
          <button v-else class="primary-button health-retry-button" @tap="retryHealthNotes">重试健康备注</button>
          <text class="health-save-message">离开本页后，尚未保存的备注将清除；也可稍后从订单重新填写。</text>
        </view>
        <button v-if="healthState !== 'saving'" class="secondary-button health-order-entry" @tap="openHealthOrder">查看订单</button>
      </view>
      <OrderStatusPanel v-if="pageMode === 'paymentPending' || pageMode === 'paid'" :page="page" />

      <view v-if="(pageMode === 'editing' || pageMode === 'review' || pageMode === 'submitting')" class="bottom-actions">
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
.draft-error { display: block; margin-top: var(--space-3); color: var(--status-error); font-size: var(--font-body-sm); line-height: 1.5; }
.draft-clear { margin: var(--space-3) 0 0; min-height: var(--size-touch-target); color: var(--text-secondary); background: transparent; font-size: var(--font-body-sm); line-height: var(--size-touch-target); }
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
  align-items: stretch;
  gap: var(--space-2);
  margin-top: var(--space-6);
}

.flow-step {
  flex-direction: column;
  flex: 1 1 0;
  min-width: 0;
  gap: var(--space-1);
  min-height: var(--size-touch-target);
  padding: var(--space-2) var(--space-1);
  border-radius: var(--radius-control);
  background: var(--surface-secondary);
}

.flow-step--active {
  background: var(--surface-elevated);
}

.flow-step__index {
  flex: 0 0 var(--space-5);
  width: var(--space-5);
  height: var(--space-5);
  border-radius: var(--space-5);
  color: var(--surface-elevated);
  font-size: 12px;
  line-height: 20px;
  text-align: center;
  background: var(--accent-primary);
}

.flow-step__label {
  min-width: 0;
  font-size: var(--font-body-sm);
  text-align: center;
  overflow-wrap: anywhere;
}

.flow-step__phrase {
  display: inline-block;
  white-space: nowrap;
}

.flow-step--active .flow-step__label {
  color: var(--accent-primary);
  font-weight: 600;
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
  z-index: var(--layer-sticky);
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
.health-save-state { margin-top: var(--space-6); padding: var(--space-5); border-radius: var(--radius-card); background: var(--surface-elevated); }
.health-save-title { display: block; color: var(--text-primary); font-size: var(--font-h3); font-weight: 600; line-height: 1.4; }
.health-save-message { display: block; margin: var(--space-3) 0; color: var(--text-secondary); font-size: var(--font-body-sm); line-height: 1.5; }
.health-order-entry { margin-top: var(--space-3); }
</style>
