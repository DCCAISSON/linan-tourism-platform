<script setup lang="ts">
import type { ActivityTrip } from "../activity-catalog"
import { formatDateLabel, formatFen } from "../enrollment-flow"
defineProps<{ readonly trip: ActivityTrip }>()
function open(sessionId: string): void { uni.navigateTo({ url: `/pages/activities/detail?sessionId=${encodeURIComponent(sessionId)}` }) }
</script>

<template>
  <view class="activity-card">
    <image v-if="trip.activity.coverImageUrl" class="activity-cover" :src="trip.activity.coverImageUrl" mode="aspectFill" :aria-label="trip.activity.title" />
    <view v-else class="activity-cover activity-cover--empty">
      <text class="cover-eyebrow">临安 · 山水课堂</text>
      <text class="cover-title">{{ trip.activity.title }}</text>
    </view>
    <view class="card-content">
      <view class="row-between"><text class="badge" :class="{ 'badge--muted': !trip.canEnroll }">{{ trip.registrationLabel }}</text><text class="caption">{{ trip.schoolName }}</text></view>
      <text class="card-title">{{ trip.activity.title }}</text>
      <text v-if="trip.activity.description" class="body-secondary">{{ trip.activity.description }}</text>
      <text class="body-secondary">{{ formatDateLabel(trip.session.startsAt) }} 至 {{ formatDateLabel(trip.session.endsAt) }}</text>
      <view class="row-between card-footer"><text class="price">{{ formatFen(trip.session.priceFen) }}<text class="caption"> / 人</text></text><button class="button-secondary activity-detail-button" @tap="open(trip.session.id)">查看详情</button></view>
    </view>
  </view>
</template>

<style>
@import "../styles/discovery.css";
</style>
