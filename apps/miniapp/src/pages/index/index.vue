<script setup lang="ts">
import { computed, ref } from "vue"
import { onShow } from "@dcloudio/uni-app"
import ActivityCard from "../../components/ActivityCard.vue"
import ConsultationEntry from "../../components/ConsultationEntry.vue"
import DiscoveryState from "../../components/DiscoveryState.vue"
import FunctionalIcon from "../../components/FunctionalIcon.vue"
import { ApiError, createMiniappApi, type OrderHistoryItem } from "../../api"
import { createPretripApi, formatPretripGatheringTime, type FamilyPretrip } from "../../pretrip-api"
import { formatFen, type LoadState } from "../../enrollment-flow"
import { hasCompletedLocalProfile } from "../../profile-display"
import { getEnrollmentDraftOwner, getWechatSessionToken } from "../../wechat-token"
import { readableError } from "./page-helpers"
import { useActivityCatalog } from "../activities/useActivityCatalog"
const { state, error, trips, load } = useActivityCatalog()
const heroTrip = computed(() => trips.value.find((trip) => trip.activity.coverImageUrl) ?? trips.value[0])
const featured = computed(() => trips.value.filter(trip => trip.session.id !== heroTrip.value?.session.id).slice(0, 3))
const failedHeroUrl = ref("")
const api = createMiniappApi()
const familyReady = ref(false)
const nextOrder = ref<OrderHistoryItem | null>(null)
const nextTripState = ref<LoadState>("empty")
const nextTripError = ref("")
const gathering = ref<FamilyPretrip["config"]>(null)
const gatheringError = ref("")
const tripStarted = computed(() => nextOrder.value !== null && Date.parse(nextOrder.value.startsAt) <= Date.now())
let loadGeneration = 0
onShow(() => { void load(); void loadNextTrip() })
async function loadNextTrip(): Promise<void> {
  const generation = ++loadGeneration
  const sessionToken = getWechatSessionToken()
  familyReady.value = sessionToken !== undefined && hasCompletedLocalProfile(getEnrollmentDraftOwner())
  nextOrder.value = null; gathering.value = null; nextTripError.value = ""; gatheringError.value = ""
  if (!familyReady.value) { nextTripState.value = "empty"; return }
  nextTripState.value = "loading"
  try {
    const [orders, sessions] = await Promise.all([api.listOrders(), api.listTourSessions()])
    if (generation !== loadGeneration || sessionToken !== getWechatSessionToken()) return
    const now = Date.now()
    const validSessions = new Set(sessions.filter(item => item.status === "published" || item.status === "closed").map(item => item.id))
    nextOrder.value = orders.filter(item => item.status === "paid" && Date.parse(item.endsAt) >= now && validSessions.has(item.tourSessionId))
      .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt))[0] ?? null
    nextTripState.value = nextOrder.value ? "ready" : "empty"
  } catch (cause) {
    const currentToken = getWechatSessionToken()
    if (generation !== loadGeneration || (currentToken !== undefined && sessionToken !== currentToken)) return
    nextTripState.value = "error"
    nextTripError.value = cause instanceof ApiError && cause.statusCode === 401 ? "登录已过期，请到「我的」重新登录。" : readableError(cause, "出行信息加载失败，请重试")
    return
  }
  if (!nextOrder.value) return
  try {
    const pretrip = await createPretripApi().getPretrip(nextOrder.value.id)
    if (generation !== loadGeneration || sessionToken !== getWechatSessionToken()) return
    gathering.value = pretrip.config
  } catch (cause) {
    if (generation !== loadGeneration || sessionToken !== getWechatSessionToken()) return
    gatheringError.value = readableError(cause, "集合信息暂时无法加载，请重试")
  }
}
function formatTripDate(iso: string): string { return new Date(Date.parse(iso) + 8 * 60 * 60 * 1000).toISOString().slice(0, 10) }
function openNextTrip(): void {
  if (nextOrder.value) uni.navigateTo({ url: `/pages/orders/pretrip?orderId=${encodeURIComponent(nextOrder.value.id)}` })
}
function activities(): void { uni.switchTab({ url: "/pages/activities/index" }) }
function featuredActivity(): void {
  if (heroTrip.value && state.value === "ready") uni.navigateTo({ url: `/pages/activities/detail?sessionId=${encodeURIComponent(heroTrip.value.session.id)}` })
  else activities()
}
function business(): void { uni.navigateTo({ url: "/pages/business/index" }) }
function orders(): void { uni.switchTab({ url: "/pages/orders/index" }) }
function family(): void { uni.switchTab({ url: "/pages/family/index" }) }
</script>

<template>
  <view class="discovery-page home-page">
    <view class="home-brand"><text class="home-brand-name">临安旅游通</text><text class="brand-eyebrow">临安旅游集散中心</text></view>
    <view v-if="familyReady && nextTripState !== 'empty'" class="home-next-trip info-card">
      <template v-if="nextTripState === 'ready' && nextOrder">
        <view class="row-between"><text class="home-next-trip-label">{{ tripStarted ? '本次出行' : '下一次出行' }}</text><text class="badge">已报名</text></view>
        <text class="card-title">{{ nextOrder.activityTitle }}</text>
        <text class="home-next-trip-date"><text class="home-date-unit">{{ formatTripDate(nextOrder.startsAt) }}</text><template v-if="formatTripDate(nextOrder.startsAt) !== formatTripDate(nextOrder.endsAt)"> 至 <text class="home-date-unit">{{ formatTripDate(nextOrder.endsAt) }}</text></template><text class="caption home-date-unit">（北京时间）</text></text>
        <text class="body-secondary">{{ nextOrder.schoolName }}</text>
        <text v-if="gathering?.gatheringAt" class="detail-line">集合时间：{{ formatPretripGatheringTime(gathering.gatheringAt) }}（北京时间）</text>
        <text v-if="gathering?.gatheringPlace" class="detail-line">集合地点：{{ gathering.gatheringPlace }}</text>
        <view v-if="gatheringError" class="home-trip-error"><text>{{ gatheringError }}</text><button class="button-secondary" @tap="loadNextTrip">重新加载</button></view>
        <button class="button-primary home-pretrip-entry" @tap="openNextTrip">查看行前信息</button>
      </template>
      <text v-else-if="nextTripState === 'loading'" class="body-secondary">正在查看您的出行安排…</text>
      <view v-else class="home-trip-error"><text>{{ nextTripError }}</text><view class="home-hero-actions"><button class="button-secondary" @tap="loadNextTrip">重新加载</button><button class="button-secondary" @tap="family">前往我的</button></view></view>
    </view>
    <view class="brand-banner">
      <view v-if="heroTrip?.activity.coverImageUrl && failedHeroUrl !== heroTrip.activity.coverImageUrl" class="home-visual">
        <image class="home-landscape" :src="heroTrip.activity.coverImageUrl" mode="aspectFill" :aria-label="heroTrip.activity.title" @error="failedHeroUrl = heroTrip.activity.coverImageUrl" />
      </view>
      <view v-else class="home-brand-visual"><image class="home-landscape" src="/static/images/linan-nature-illustration.jpg" mode="aspectFill" aria-label="山水研学品牌插画" /><text class="home-photo-caption">山水研学 · 品牌插画</text></view>
      <view class="home-hero-copy">
        <view class="study-brand">
          <view class="study-brand-logo"><image class="study-brand-logo-source" src="/static/images/quyanxue-brand-original.png" mode="scaleToFill" aria-label="趣研学正式标识" /></view>
          <view class="study-brand-copy"><text class="brand-title">趣研学</text><text class="brand-summary">无边界课堂 · 自然生长</text></view>
        </view>
        <view v-if="state === 'ready' && heroTrip" class="home-feature-copy">
          <text class="home-feature-title">{{ heroTrip.activity.title }}</text>
          <text v-if="heroTrip.activity.description" class="body-secondary">{{ heroTrip.activity.description }}</text>
          <text v-if="heroTrip.session.activeNotice?.contentJson.destination" class="body-secondary">目的地：{{ heroTrip.session.activeNotice.contentJson.destination }}</text>
          <text class="body-secondary">{{ heroTrip.schoolName }} · <text class="home-date-unit">{{ formatTripDate(heroTrip.session.startsAt) }}</text><template v-if="formatTripDate(heroTrip.session.startsAt) !== formatTripDate(heroTrip.session.endsAt)"> 至 <text class="home-date-unit">{{ formatTripDate(heroTrip.session.endsAt) }}</text></template></text>
          <view class="home-feature-price"><text class="price">{{ formatFen(heroTrip.session.priceFen) }}<text class="caption"> / 人</text></text><text class="caption">学生、成人同价 · {{ heroTrip.registrationLabel }}</text></view>
        </view>
        <view class="home-hero-actions"><button class="button-primary home-activities-entry" @tap="featuredActivity">{{ state === 'ready' && heroTrip ? '查看活动详情' : '查看研学活动' }}</button><ConsultationEntry class="home-consultation-entry" /></view>
      </view>
    </view>
    <view v-if="featured.length > 0 && state === 'ready'" class="row-between home-section"><text class="section-heading">更多研学活动</text><button class="button-secondary home-more-entry" @tap="activities">查看全部</button></view>
    <DiscoveryState :state="state" :message="error" empty-title="暂无已发布活动" @retry="load" />
    <view v-if="state === 'ready'"><ActivityCard v-for="trip in featured" :key="trip.session.id" :trip="trip" /></view>
    <view class="home-shortcuts">
      <button class="button-secondary" @tap="orders"><view class="shortcut-icon"><FunctionalIcon name="orders" /></view><text class="shortcut-title">我的订单</text><text class="shortcut-caption">报名与行前信息</text></button>
      <button class="button-secondary" @tap="family"><view class="shortcut-icon"><FunctionalIcon name="people" /></view><text class="shortcut-title">常用参加人</text><text class="shortcut-caption">下次报名少填写</text></button>
      <button class="button-secondary" @tap="business"><view class="shortcut-icon"><FunctionalIcon name="travel" /></view><text class="shortcut-title">商旅服务</text><text class="shortcut-caption">旅游与疗休养</text></button>
    </view>
  </view>
</template>

<style>
@import "../../styles/discovery.css";
.home-brand { margin-bottom: var(--space-4); }
.home-brand-name { display: block; color: var(--brand-ink); font-size: var(--font-h2); font-weight: 700; line-height: 1.4; }
.brand-eyebrow { display: block; margin-top: var(--space-1); color: var(--text-secondary); font-size: var(--font-caption); line-height: 1.5; }
.brand-banner { overflow: hidden; border-radius: var(--radius-banner); background: var(--surface-elevated); }
.home-landscape { display: block; width: 100%; height: calc(var(--space-10) * 3); background: var(--brand-mist); }
.home-photo-caption { display: block; padding: var(--space-2) var(--space-4); color: var(--text-secondary); background: var(--surface-secondary); font-size: var(--font-body-sm); line-height: 1.5; }
.home-hero-copy { padding: var(--space-4); }
.study-brand { display: flex; align-items: center; gap: var(--space-3); }
.study-brand-copy { flex: 1; min-width: 0; }
.study-brand-logo { position: relative; flex: 0 0 var(--space-10); width: var(--space-10); height: var(--space-10); overflow: hidden; background: var(--surface-elevated); }
.study-brand-logo-source { position: absolute; width: 298.461538%; height: 131.538462%; left: -100%; top: -21.153846%; max-width: none; }
.brand-title { display: block; color: var(--brand-ink); font-size: var(--font-h2); font-weight: 700; line-height: 1.4; }
.brand-summary { display: block; margin: var(--space-2) 0 0; color: var(--text-secondary); font-size: var(--font-body-sm); line-height: 1.5; }
.home-hero-actions { display: flex; gap: var(--space-3); margin-top: var(--space-4); }
.home-activities-entry { flex: 1; }
.home-consultation-entry { flex: 0 0 calc(var(--space-10) + var(--space-4)); }
.home-shortcuts { display: flex; gap: var(--space-2); margin-top: var(--space-4); }
.home-shortcuts button { flex: 1; min-width: 0; padding: var(--space-3) var(--space-2); background: transparent; border-radius: var(--radius-card); }
.shortcut-title { display: block; font-size: var(--font-body-sm); font-weight: 600; line-height: 1.5; }
.shortcut-icon { display: inline-flex; margin-bottom: var(--space-2); padding: var(--space-2); border-radius: var(--radius-control); background: var(--surface-elevated); }
.shortcut-caption { display: block; margin-top: var(--space-2); color: var(--text-secondary); font-size: var(--font-caption); line-height: 1.5; }
.home-section { margin-top: var(--space-3); }
.home-section .section-heading { margin: var(--space-3) 0; }
.home-more-entry { font-size: var(--font-body-sm); background: transparent; padding-right: 0; }
.home-next-trip { margin: 0 0 var(--space-4); }
.home-next-trip-label { color: var(--accent-primary); font-size: var(--font-body-sm); font-weight: 600; }
.home-next-trip-date { display: block; margin-top: var(--space-3); color: var(--text-primary); font-size: var(--font-body); line-height: 1.6; }
.home-pretrip-entry { margin-top: var(--space-4); }
.home-trip-error { color: var(--text-secondary); font-size: var(--font-body-sm); line-height: 1.6; }
.home-trip-error > button { margin-top: var(--space-3); }
.home-feature-copy { margin-top: var(--space-4); padding-top: var(--space-4); border-top: 1px solid var(--border-subtle); }
.home-feature-title { display: block; color: var(--text-primary); font-size: var(--font-h3); font-weight: 600; line-height: 1.5; }
.home-feature-price { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-3); }
.home-date-unit { display: inline-block; white-space: nowrap; }
</style>
