<script setup lang="ts">
import { computed } from "vue"
import { onShow } from "@dcloudio/uni-app"
import ActivityCard from "../../components/ActivityCard.vue"
import DiscoveryState from "../../components/DiscoveryState.vue"
import { useActivityCatalog } from "../activities/useActivityCatalog"
const { state, error, trips, load } = useActivityCatalog()
const featured = computed(() => trips.value.slice(0, 3))
onShow(() => { void load() })
function activities(): void { uni.switchTab({ url: "/pages/activities/index" }) }
function business(): void { uni.navigateTo({ url: "/pages/business/index" }) }
function orders(): void { uni.switchTab({ url: "/pages/orders/index" }) }
function family(): void { uni.switchTab({ url: "/pages/family/index" }) }
</script>

<template>
  <view class="discovery-page home-page">
    <view class="brand-banner">
      <text class="brand-eyebrow">临安旅游集散中心</text>
      <text class="brand-title">山水课堂</text><text class="brand-title brand-title--second">行走中成长</text>
      <text class="brand-summary">选择研学行程，一家人的报名与订单在这里管理。</text>
      <button class="button-primary home-activities-entry" @tap="activities">查看研学活动</button>
    </view>
    <view class="home-shortcuts">
      <button class="button-secondary" @tap="orders">我的订单</button>
      <button class="button-secondary" @tap="family">家庭成员</button>
      <button class="button-secondary" @tap="business">商旅服务</button>
    </view>
    <view class="row-between home-section"><text class="section-heading">研学活动</text><button class="button-secondary home-more-entry" @tap="activities">查看全部</button></view>
    <DiscoveryState :state="state" :message="error" empty-title="暂无已发布活动" @retry="load" />
    <view v-if="state === 'ready'"><ActivityCard v-for="trip in featured" :key="trip.session.id" :trip="trip" /></view>
    <text class="test-notice">当前为开发体验版。报名和家庭订单可体验；真实支付暂未启用，不会产生扣款。</text>
  </view>
</template>

<style>
@import "../../styles/discovery.css";
.brand-banner { padding: var(--space-6); border-radius: var(--radius-banner); background: var(--brand-mist); }
.brand-eyebrow { display: block; color: var(--accent-secondary); font-size: var(--font-body-sm); line-height: 1.5; }
.brand-title { display: block; margin-top: var(--space-4); color: var(--brand-ink); font-size: var(--font-display); font-weight: 700; line-height: 1.35; white-space: pre-line; }
.brand-title--second { margin-top: 0; }
.brand-summary { display: block; margin: var(--space-4) 0 var(--space-5); color: var(--text-secondary); font-size: var(--font-body); line-height: 1.6; }
.home-shortcuts { display: flex; gap: var(--space-3); margin-top: var(--space-4); }
.home-shortcuts button { flex: 1; min-width: 0; }
.home-section { margin-top: var(--space-3); }
.home-section .section-heading { margin: var(--space-3) 0; }
.home-more-entry { font-size: var(--font-body-sm); }
</style>
