<script setup lang="ts">
import { computed, ref } from "vue"
import { onShow } from "@dcloudio/uni-app"
import ActivityCard from "../../components/ActivityCard.vue"
import ConsultationEntry from "../../components/ConsultationEntry.vue"
import DiscoveryState from "../../components/DiscoveryState.vue"
import FunctionalIcon from "../../components/FunctionalIcon.vue"
import { useActivityCatalog } from "../activities/useActivityCatalog"
const { state, error, trips, load } = useActivityCatalog()
const featured = computed(() => trips.value.slice(0, 3))
const heroTrip = computed(() => trips.value.find((trip) => trip.activity.coverImageUrl))
const failedHeroUrl = ref("")
onShow(() => { void load() })
function activities(): void { uni.switchTab({ url: "/pages/activities/index" }) }
function business(): void { uni.navigateTo({ url: "/pages/business/index" }) }
function orders(): void { uni.switchTab({ url: "/pages/orders/index" }) }
function family(): void { uni.switchTab({ url: "/pages/family/index" }) }
</script>

<template>
  <view class="discovery-page home-page">
    <view class="home-brand"><text class="home-brand-name">临安旅游通</text><text class="brand-eyebrow">临安旅游集散中心</text></view>
    <view class="brand-banner">
      <view v-if="heroTrip?.activity.coverImageUrl && failedHeroUrl !== heroTrip.activity.coverImageUrl" class="home-visual">
        <image class="home-landscape" :src="heroTrip.activity.coverImageUrl" mode="aspectFill" :aria-label="heroTrip.activity.title" @error="failedHeroUrl = heroTrip.activity.coverImageUrl" />
        <text class="home-photo-caption">{{ heroTrip.activity.title }}</text>
      </view>
      <view v-else class="home-brand-visual"><image class="home-landscape" src="/static/images/linan-nature-illustration.jpg" mode="aspectFill" aria-label="山水研学品牌插画" /><text class="home-photo-caption">山水研学 · 品牌插画</text></view>
      <view class="home-hero-copy">
        <view class="study-brand">
          <view class="study-brand-logo"><image class="study-brand-logo-source" src="/static/images/quyanxue-brand-original.png" mode="scaleToFill" aria-label="趣研学正式标识" /></view>
          <view class="study-brand-copy"><text class="brand-title">趣研学</text><text class="brand-summary">无边界课堂 · 自然生长</text></view>
        </view>
        <view class="home-hero-actions"><button class="button-primary home-activities-entry" @tap="activities">查看研学活动</button><ConsultationEntry class="home-consultation-entry" /></view>
      </view>
    </view>
    <view class="home-shortcuts">
      <button class="button-secondary" @tap="orders"><view class="shortcut-icon"><FunctionalIcon name="orders" /></view><text class="shortcut-title">我的订单</text><text class="shortcut-caption">报名与行前信息</text></button>
      <button class="button-secondary" @tap="family"><view class="shortcut-icon"><FunctionalIcon name="people" /></view><text class="shortcut-title">常用参加人</text><text class="shortcut-caption">下次报名少填写</text></button>
      <button class="button-secondary" @tap="business"><view class="shortcut-icon"><FunctionalIcon name="travel" /></view><text class="shortcut-title">商旅服务</text><text class="shortcut-caption">旅游与疗休养</text></button>
    </view>
    <view class="row-between home-section"><text class="section-heading">趣研学活动</text><button class="button-secondary home-more-entry" @tap="activities">查看全部</button></view>
    <DiscoveryState :state="state" :message="error" empty-title="暂无已发布活动" @retry="load" />
    <view v-if="state === 'ready'"><ActivityCard v-for="trip in featured" :key="trip.session.id" :trip="trip" /></view>
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
</style>
