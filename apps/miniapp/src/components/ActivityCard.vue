<script setup lang="ts">
import { ref } from "vue"
import type { ActivityTrip } from "../activity-catalog"
import { formatDateLabel, formatFen } from "../enrollment-flow"
defineProps<{ readonly trip: ActivityTrip }>()
const failedCoverUrl = ref("")
function open(sessionId: string): void { uni.navigateTo({ url: `/pages/activities/detail?sessionId=${encodeURIComponent(sessionId)}` }) }
</script>

<template>
  <view class="activity-card" role="link" :aria-label="`查看活动：${trip.activity.title}`" @tap="open(trip.session.id)">
    <image v-if="trip.activity.coverImageUrl && failedCoverUrl !== trip.activity.coverImageUrl" class="activity-cover" :src="trip.activity.coverImageUrl" mode="aspectFill" :aria-label="trip.activity.title" @error="failedCoverUrl = trip.activity.coverImageUrl" />
    <view v-else class="activity-cover activity-cover--empty">
      <text class="cover-eyebrow">临安研学</text>
      <text class="cover-title">山水课堂</text>
    </view>
    <view class="card-content">
      <view class="activity-card__meta"><text class="badge" :class="{ 'badge--muted': !trip.canEnroll }">{{ trip.registrationLabel }}</text><text class="caption activity-card__school">{{ trip.schoolName }}</text></view>
      <text class="card-title">{{ trip.activity.title }}</text>
      <text class="body-secondary activity-card__date">{{ formatDateLabel(trip.session.startsAt) }} 至 {{ formatDateLabel(trip.session.endsAt) }}</text>
      <view class="row-between card-footer"><view><text class="price">{{ formatFen(trip.session.priceFen) }}<text class="caption"> / 人</text></text><text class="activity-card__pricing">学生、成人同价</text></view><button class="button-secondary activity-detail-button" @tap.stop="open(trip.session.id)">查看详情</button></view>
    </view>
  </view>
</template>

<style>
@import "../styles/discovery.css";
</style>
