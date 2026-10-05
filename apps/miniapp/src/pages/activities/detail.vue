<script setup lang="ts">
import { computed, ref } from "vue"
import { onLoad, onShareAppMessage } from "@dcloudio/uni-app"
import DiscoveryState from "../../components/DiscoveryState.vue"
import ConsultationEntry from "../../components/ConsultationEntry.vue"
import ProfileLoginSheet from "../../components/ProfileLoginSheet.vue"
import { activitySessionChoices } from "../../activity-catalog"
import { formatDateLabel, formatFen } from "../../enrollment-flow"
import { hasCompletedLocalProfile } from "../../profile-display"
import { getEnrollmentDraftOwner, getWechatSessionToken } from "../../wechat-token"
import { useActivityCatalog } from "./useActivityCatalog"
const { state, error, trips, load } = useActivityCatalog()
const sessionId = ref("")
const failedCoverUrl = ref("")
const loginSheetVisible = ref(false)
const trip = computed(() => trips.value.find((item) => item.session.id === sessionId.value))
const sessionChoices = computed(() => activitySessionChoices(trips.value, sessionId.value))
const detailState = computed(() => state.value === "ready" && trip.value === undefined ? "empty" : state.value)
const sections = [
  { id: "introduction", title: "活动介绍" },
  { id: "notice", title: "报名须知" },
  { id: "refund", title: "退费说明" },
] as const
type SectionId = typeof sections[number]["id"]
const activeSectionId = ref<SectionId | undefined>()
const activeSection = computed(() => sections.find((section) => section.id === activeSectionId.value))
function openSection(id: SectionId): void { activeSectionId.value = id }
function closeSection(): void { activeSectionId.value = undefined }
function selectSession(id: string): void { sessionId.value = id }
function navigateToEnrollment(): void {
  const selected = trip.value
  if (selected?.canEnroll) uni.navigateTo({ url: `/pages/enrollment/index?sessionId=${encodeURIComponent(selected.session.id)}&schoolId=${encodeURIComponent(selected.session.organizationId)}` })
}
onLoad((query) => { sessionId.value = query?.["sessionId"] ?? ""; void load() })
onShareAppMessage(() => {
  const selected = trip.value
  if (detailState.value !== "ready" || !selected) return { title: "研学活动", path: "/pages/activities/index" }
  return {
    title: selected.activity.title,
    path: `/pages/activities/detail?sessionId=${encodeURIComponent(selected.session.id)}`,
    ...(selected.activity.coverImageUrl ? { imageUrl: selected.activity.coverImageUrl } : {}),
  }
})
function enroll(): void {
  const selected = trip.value
  if (!selected?.canEnroll) return
  if (getWechatSessionToken() === undefined || !hasCompletedLocalProfile(getEnrollmentDraftOwner())) {
    loginSheetVisible.value = true
    return
  }
  navigateToEnrollment()
}
function completeEnrollmentLogin(): void { loginSheetVisible.value = false; navigateToEnrollment() }
function cancelEnrollmentLogin(): void { loginSheetVisible.value = false }
</script>

<template>
  <page-meta :page-style="activeSection ? 'overflow: hidden;' : ''" />
  <view class="discovery-page activity-detail-page">
    <ProfileLoginSheet v-if="loginSheetVisible" @completed="completeEnrollmentLogin" @cancelled="cancelEnrollmentLogin" />
    <DiscoveryState :state="detailState" :message="error" empty-title="该团期暂不可查看" @retry="load" />
    <view v-if="detailState === 'ready' && trip">
      <image v-if="trip.activity.coverImageUrl && failedCoverUrl !== trip.activity.coverImageUrl" class="activity-cover detail-cover" :src="trip.activity.coverImageUrl" mode="aspectFill" :aria-label="trip.activity.title" @error="failedCoverUrl = trip.activity.coverImageUrl" />
      <view v-else class="activity-cover activity-cover--empty detail-cover"><text class="cover-eyebrow">临安 · 山水课堂</text><text class="cover-title">走进自然，探索新知</text></view>
      <view class="info-card detail-overview">
        <view class="row-between">
          <text class="badge" :class="{ 'badge--muted': !trip.canEnroll }">{{ trip.registrationLabel }}</text>
          <button class="button-secondary activity-share-entry" open-type="share">分享活动</button>
        </view>
        <text class="page-heading activity-detail-title">{{ trip.activity.title }}</text>
        <view class="detail-facts">
          <view class="detail-price-row"><text class="price">{{ formatFen(trip.session.priceFen) }}<text class="caption"> / 人</text></text><text class="detail-price-note">学生、成人同价</text></view>
          <view class="detail-fact-row"><text class="detail-fact-label">适用学校</text><text>{{ trip.schoolName }}</text></view>
          <view class="detail-fact-row"><text class="detail-fact-label">报名截止</text><text>{{ formatDateLabel(trip.session.enrollmentClosesAt) }}</text></view>
        </view>
      </view>
      <view v-if="sessionChoices.length > 0" class="session-choice-card">
        <text class="card-title">参营日期</text>
        <view class="session-choice-list">
          <button v-for="choice in sessionChoices" :key="choice.session.id" class="session-choice" :class="{ 'session-choice--selected': choice.session.id === trip.session.id }" :data-session-id="choice.session.id" :aria-pressed="choice.session.id === trip.session.id" @tap="selectSession(choice.session.id)">
            <text class="session-choice__date">{{ formatDateLabel(choice.session.startsAt) }} 至 {{ formatDateLabel(choice.session.endsAt) }}</text>
            <view class="session-choice__summary"><text>{{ formatFen(choice.session.priceFen) }} / 人 · {{ choice.registrationLabel }}</text><text v-if="choice.session.id === trip.session.id" class="session-choice__selected">已选</text></view>
          </button>
        </view>
      </view>
      <view id="activity-itinerary" class="detail-inline-section">
        <text class="section-heading">行程安排</text>
        <template v-if="trip.session.activeNotice">
          <view class="itinerary-facts">
            <text class="detail-line">目的地：{{ trip.session.activeNotice.contentJson.destination }}</text>
            <text class="detail-line">集合地点：{{ trip.session.activeNotice.contentJson.departurePlace }}</text>
            <text class="detail-line">用餐说明：{{ trip.session.activeNotice.contentJson.mealNote }}</text>
          </view>
          <view class="itinerary-timeline">
            <view v-for="(item, index) in trip.session.activeNotice.contentJson.itinerary" :key="`${index}-${item}`" class="itinerary-step">
              <text class="itinerary-number">{{ index + 1 }}</text><text class="detail-line">{{ item }}</text>
            </view>
          </view>
        </template>
        <text v-else class="detail-line">行程安排暂未提供，请联系工作人员了解。</text>
      </view>
      <view id="activity-fees" class="detail-inline-section">
        <text class="section-heading">费用说明</text>
        <view class="detail-fees-summary"><text class="price">{{ formatFen(trip.session.priceFen) }}<text class="caption"> / 人</text></text><text class="detail-line">学生、成人同价，按实际报名人数计费。</text></view>
        <text class="detail-line">合计 = 单价 × 参加人数</text>
        <template v-if="trip.session.activeNotice">
          <text v-for="item in trip.session.activeNotice.contentJson.unitPrices" :key="item" class="detail-line">{{ item }}</text>
          <text v-for="item in trip.session.activeNotice.contentJson.packageExamples" :key="item" class="detail-line">{{ item }}</text>
        </template>
        <text v-else class="detail-line">详细费用说明暂未提供，请联系工作人员了解。</text>
      </view>
      <view class="info-card detail-section-nav" aria-label="活动详情">
        <button v-for="section in sections" :key="section.id" class="detail-section-link" :data-section-id="section.id" aria-haspopup="dialog" @tap="openSection(section.id)">
          <text>{{ section.title }}</text><text class="detail-section-arrow" aria-hidden="true">›</text>
        </button>
      </view>
      <view v-if="activeSection" class="detail-sheet-overlay">
        <view class="detail-sheet-backdrop" @tap="closeSection" @touchmove.stop.prevent />
        <view class="detail-sheet" role="dialog" aria-modal="true" :aria-label="activeSection.title">
          <view class="detail-sheet-heading" @touchmove.stop.prevent>
            <text class="detail-sheet-title">{{ activeSection.title }}</text>
            <button class="detail-sheet-close" @tap="closeSection">关闭</button>
          </view>
          <scroll-view :key="activeSection.id" scroll-y class="detail-sheet-scroll">
            <view class="detail-sheet-content">
              <view v-if="activeSectionId === 'introduction'" id="activity-introduction" class="detail-section">
                <text class="detail-line introduction">{{ trip.activity.description || '课程介绍暂未提供。' }}</text>
                <text class="detail-line">团期：{{ trip.session.code }} · 人数上限 {{ trip.session.capacity }} 人</text>
                <text class="detail-line">报名开放：{{ formatDateLabel(trip.session.enrollmentOpensAt) }}</text>
                <view v-if="trip.minimumParticipantsLabel" class="minimum-participants">
                  <text class="card-title">最低人数参考</text>
                  <text class="detail-line">{{ trip.minimumParticipantsLabel }}</text>
                  <text v-if="trip.session.occupiedCapacity != null && trip.session.minimumParticipants != null" class="detail-line">{{ trip.session.occupiedCapacity >= trip.session.minimumParticipants ? '已达参考人数' : '未达参考人数' }}</text>
                  <text class="detail-line">按已付款且未取消的所有参加人统计。出行安排以工作人员通知为准。</text>
                </view>
              </view>
              <view v-else-if="activeSectionId === 'notice'" id="activity-notice" class="detail-section parent-notice-card">
                <template v-if="trip.session.activeNotice">
                  <text class="detail-line">家长告知书：{{ trip.session.activeNotice.title }}</text>
                  <text class="caption">版本：{{ trip.session.activeNotice.version }}</text>
                  <text class="detail-line notice-heading">温馨提醒</text>
                  <text v-for="item in trip.session.activeNotice.contentJson.reminders" :key="item" class="detail-line">{{ item }}</text>
                  <text class="detail-line">报名时请阅读并确认本团期的完整告知书。</text>
                </template>
                <text v-else class="detail-line">该团期暂未提供家长告知书，暂不能报名。</text>
              </view>
              <view v-else-if="activeSectionId === 'refund'" id="activity-refund" class="detail-section">
                <text class="detail-line">按取消参加人的历史实付金额计算退款，不按提前天数扣费。</text>
                <text class="detail-line">已付款订单如需退订，可前往「我的订单」查看订单详情，在可申请退款时按参加人提交申请，并填写退款原因。</text>
                <text class="detail-line">申请提交后由工作人员审核，审核及退款进度以订单详情为准。</text>
              </view>
            </view>
          </scroll-view>
        </view>
      </view>
      <view class="detail-cta">
        <ConsultationEntry class="customer-service-entry" :context="{ source: 'activity', id: trip.session.id }" />
        <button class="button-primary enrollment-entry" :disabled="!trip.canEnroll" @tap="enroll">{{ trip.canEnroll ? '立即报名' : trip.registrationLabel }}</button>
      </view>
    </view>
  </view>
</template>

<style>
@import "../../styles/discovery.css";
.activity-detail-page { padding-bottom: calc(var(--space-10) + var(--space-6) + env(safe-area-inset-bottom)); }
.detail-cover { border-radius: var(--radius-banner); }
.detail-cover.activity-cover--empty { height: calc(var(--space-10) * 2); }
.detail-overview { padding-top: var(--space-4); }
.activity-detail-title { margin-top: var(--space-3); font-size: var(--font-h2); }
.detail-facts { margin-top: var(--space-5); padding-top: var(--space-4); border-top: 1px solid var(--border-subtle); }
.detail-price-row { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--space-2) var(--space-3); margin-bottom: var(--space-4); }
.detail-price-note { color: var(--text-secondary); font-size: var(--font-body-sm); }
.detail-fact-row { display: flex; gap: var(--space-3); margin-top: var(--space-2); color: var(--text-primary); font-size: var(--font-body-sm); line-height: 1.6; }
.detail-fact-label { flex-shrink: 0; color: var(--text-secondary); }
.activity-share-entry { flex-shrink: 0; font-size: var(--font-body-sm); }
.introduction { white-space: pre-wrap; }
.session-choice-card { margin: var(--space-6) 0; }
.session-choice-list { display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-3); }
.session-choice { width: 100%; min-height: var(--size-touch-target); margin: 0; padding: var(--space-3) var(--space-4); border-radius: var(--radius-control); color: var(--text-primary); text-align: left; background: var(--surface-elevated); }
.session-choice::after { border: 0; }
.session-choice:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
.session-choice--selected { color: var(--on-accent); background: var(--accent-primary); }
.session-choice__date, .session-choice__detail { display: block; }
.session-choice__date { font-size: var(--font-body); font-weight: 600; line-height: 1.5; }
.session-choice__summary { display: flex; justify-content: space-between; gap: var(--space-3); margin-top: var(--space-2); font-size: var(--font-body-sm); line-height: 1.5; }
.session-choice__selected { flex-shrink: 0; font-weight: 600; }
.detail-section-nav { padding: 0 var(--space-4); }
.detail-section-link { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); width: 100%; min-height: var(--size-touch-target); margin: 0; padding: var(--space-3) 0; border-radius: 0; color: var(--text-primary); background: transparent; font-size: var(--font-body); line-height: 1.5; text-align: left; }
.detail-section-link + .detail-section-link { border-top: 1px solid var(--border-subtle); }
.detail-section-link::after, .detail-sheet-close::after { border: 0; }
.detail-section-link:active, .detail-sheet-close:active { background: var(--accent-soft); }
.detail-section-link:focus-visible, .detail-sheet-close:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: -2px; }
.detail-section-arrow { color: var(--text-secondary); font-size: var(--font-h2); }
.detail-sheet-overlay { position: fixed; inset: 0; z-index: var(--layer-modal); display: flex; align-items: flex-end; justify-content: center; }
.detail-sheet-backdrop { position: absolute; inset: 0; background: var(--overlay-scrim); }
.detail-sheet { position: relative; display: flex; flex-direction: column; width: 100%; max-width: var(--sheet-max-width); height: 80vh; overflow: hidden; border-radius: var(--radius-banner) var(--radius-banner) 0 0; background: var(--surface-elevated); }
.detail-sheet-heading { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--border-subtle); }
.detail-sheet-title { color: var(--text-primary); font-size: var(--font-h3); font-weight: 600; line-height: 1.4; }
.detail-sheet-close { min-height: var(--size-touch-target); margin: 0; padding: 0 var(--space-2); color: var(--accent-primary); background: transparent; font-size: var(--font-body-sm); line-height: var(--size-touch-target); }
.detail-sheet-scroll { flex: 1; height: 0; min-height: 0; }
.detail-sheet-content { padding: var(--space-4) var(--space-4) calc(var(--space-6) + env(safe-area-inset-bottom)); overflow-wrap: anywhere; }
.detail-sheet-content .detail-line:first-child { margin-top: 0; }
.minimum-participants { margin-top: var(--space-5); padding-top: var(--space-4); border-top: 1px solid var(--border-subtle); }
.detail-inline-section { margin-top: var(--space-6); padding-bottom: var(--space-5); }
.detail-inline-section + .detail-inline-section { border-top: 1px solid var(--border-subtle); }
.itinerary-facts { padding: 0 0 var(--space-4); }
.itinerary-timeline { margin-top: var(--space-2); }
.itinerary-step { position: relative; display: flex; align-items: flex-start; gap: var(--space-3); padding-bottom: var(--space-4); }
.itinerary-step:not(:last-child)::before { position: absolute; content: ""; top: var(--space-6); bottom: 0; left: calc(var(--space-3) - 1px); border-left: 2px solid var(--border-default); }
.itinerary-step .detail-line { margin-top: 0; }
.itinerary-number { flex: 0 0 var(--space-6); width: var(--space-6); height: var(--space-6); border-radius: var(--radius-control); color: var(--accent-primary); background: var(--accent-soft); font-size: var(--font-body-sm); font-weight: 600; line-height: var(--space-6); text-align: center; }
.detail-fees-summary { padding: var(--space-4); border-radius: var(--radius-control); background: var(--surface-secondary); }
.parent-notice-card { gap: var(--space-2); }
.notice-heading { font-weight: 700; color: var(--text-primary); }
.detail-cta { position: fixed; right: 0; bottom: 0; left: 0; display: flex; gap: var(--space-3); padding: var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom)); background: var(--surface-elevated); }
.customer-service-entry { flex: 0 0 112px; margin: 0; }
.enrollment-entry { flex: 1 1 auto; margin: 0; }
</style>
