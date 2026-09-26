<script setup lang="ts">
import { computed, ref } from "vue"
import { onLoad } from "@dcloudio/uni-app"
import DiscoveryState from "../../components/DiscoveryState.vue"
import { formatDateLabel, formatFen } from "../../enrollment-flow"
import { useActivityCatalog } from "./useActivityCatalog"
const { state, error, trips, load } = useActivityCatalog()
const sessionId = ref("")
const trip = computed(() => trips.value.find((item) => item.session.id === sessionId.value))
const detailState = computed(() => state.value === "ready" && trip.value === undefined ? "empty" : state.value)
onLoad((query) => { sessionId.value = query?.["sessionId"] ?? ""; void load() })
function enroll(): void {
  const selected = trip.value
  if (selected?.canEnroll) uni.navigateTo({ url: `/pages/enrollment/index?sessionId=${encodeURIComponent(selected.session.id)}&schoolId=${encodeURIComponent(selected.session.organizationId)}` })
}
</script>

<template>
  <view class="discovery-page activity-detail-page">
    <DiscoveryState :state="detailState" :message="error" empty-title="该团期暂不可查看" @retry="load" />
    <view v-if="detailState === 'ready' && trip">
      <image v-if="trip.activity.coverImageUrl" class="activity-cover detail-cover" :src="trip.activity.coverImageUrl" mode="aspectFill" :aria-label="trip.activity.title" />
      <view v-else class="activity-cover activity-cover--empty detail-cover"><text class="cover-eyebrow">临安 · 山水课堂</text><text class="cover-title">{{ trip.activity.title }}</text></view>
      <view class="info-card">
        <text class="badge" :class="{ 'badge--muted': !trip.canEnroll }">{{ trip.registrationLabel }}</text>
        <text class="page-heading activity-detail-title">{{ trip.activity.title }}</text>
        <text class="price action-gap">{{ formatFen(trip.session.priceFen) }}<text class="caption"> / 人 · 学校价格</text></text>
        <text class="detail-line">学校：{{ trip.schoolName }}</text>
        <text class="detail-line">团期：{{ trip.session.code }}</text>
        <text class="detail-line">出行：{{ formatDateLabel(trip.session.startsAt) }} 至 {{ formatDateLabel(trip.session.endsAt) }}</text>
        <text class="detail-line">报名：{{ formatDateLabel(trip.session.enrollmentOpensAt) }} 至 {{ formatDateLabel(trip.session.enrollmentClosesAt) }}</text>
        <text class="detail-line">人数上限：{{ trip.session.capacity }} 人</text>
      </view>
      <view class="info-card"><text class="card-title">课程介绍</text><text class="detail-line introduction">{{ trip.activity.description || '课程介绍暂未提供。' }}</text></view>

      <view v-if="trip.session.activeNotice" class="info-card parent-notice-card">
        <text class="card-title">家长告知书：{{ trip.session.activeNotice.title }}</text>
        <text class="detail-line">版本：{{ trip.session.activeNotice.version }}</text>
        <text class="detail-line">目的地：{{ trip.session.activeNotice.contentJson.destination }}</text>
        <text class="detail-line">集合地点：{{ trip.session.activeNotice.contentJson.departurePlace }}</text>
        <text class="detail-line">用餐说明：{{ trip.session.activeNotice.contentJson.mealNote }}</text>
        <view class="notice-block">
          <text class="notice-heading">行程安排</text>
          <text v-for="item in trip.session.activeNotice.contentJson.itinerary" :key="item" class="detail-line">{{ item }}</text>
        </view>
        <view class="notice-block">
          <text class="notice-heading">费用说明</text>
          <text v-for="item in trip.session.activeNotice.contentJson.unitPrices" :key="item" class="detail-line">{{ item }}</text>
          <text v-for="item in trip.session.activeNotice.contentJson.packageExamples" :key="item" class="detail-line">{{ item }}</text>
        </view>
        <view class="notice-block">
          <text class="notice-heading">温馨提醒</text>
          <text v-for="item in trip.session.activeNotice.contentJson.reminders" :key="item" class="detail-line">{{ item }}</text>
        </view>
      </view>
      <view v-else class="info-card parent-notice-card"><text class="card-title">家长告知书</text><text class="detail-line">该团期尚未配置家长告知书，暂不可提交报名。</text></view>
      <view class="detail-cta"><button class="button-primary enrollment-entry" :disabled="!trip.canEnroll" @tap="enroll">{{ trip.canEnroll ? '立即报名' : trip.registrationLabel }}</button></view>
    </view>
  </view>
</template>

<style>
@import "../../styles/discovery.css";
.activity-detail-page { padding-bottom: calc(var(--space-10) + var(--space-6) + env(safe-area-inset-bottom)); }
.detail-cover { border-radius: var(--radius-banner); }
.activity-detail-title { margin-top: var(--space-3); font-size: var(--font-h2); }
.introduction { white-space: pre-wrap; }
.parent-notice-card { gap: var(--space-2); }
.notice-block { display: flex; flex-direction: column; gap: var(--space-1); }
.notice-heading { font-weight: 700; color: var(--text-strong); }
.detail-cta { position: fixed; right: 0; bottom: 0; left: 0; padding: var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom)); background: var(--surface-elevated); }
</style>
