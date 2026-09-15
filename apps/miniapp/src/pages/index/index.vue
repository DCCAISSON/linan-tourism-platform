<script setup lang="ts">
import { HEALTH_COPY } from "../../health"
</script>

<template>
  <view class="page">
    <view class="status" aria-label="运行状态">
      <view class="status__mark" />
      <text class="status__text">{{ HEALTH_COPY.status }}</text>
    </view>

    <view class="hero">
      <text class="hero__eyebrow">家长端</text>
      <text class="hero__title">{{ HEALTH_COPY.title }}</text>
      <text class="hero__summary">{{ HEALTH_COPY.summary }}</text>
    </view>

    <view class="panel">
      <text class="panel__title">启动检查</text>
      <view class="checklist">
        <view v-for="checkpoint in HEALTH_COPY.checkpoints" :key="checkpoint" class="checklist__item">
          <view class="checklist__dot" />
          <text class="checklist__text">{{ checkpoint }}</text>
        </view>
      </view>
    </view>

    <view class="notice">
      <text class="notice__label">下一步</text>
      <text class="notice__body">等待 AppID、服务域名和支付参数后接入真实业务。</text>
    </view>
  </view>
</template>

<style scoped>
.page {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 48px 16px 32px;
  background: var(--surface-primary);
}

.status {
  display: flex;
  align-items: center;
  min-height: 44px;
  gap: 8px;
}

.status__mark {
  width: 8px;
  height: 8px;
  border-radius: 8px;
  background: var(--status-success);
}

.status__text {
  color: var(--accent-primary);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
}

.hero {
  margin-top: 32px;
}

.hero__eyebrow,
.notice__label {
  display: block;
  color: var(--accent-warm);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
}

.hero__title {
  display: block;
  margin-top: 12px;
  color: var(--text-primary);
  font-size: 32px;
  font-weight: 700;
  line-height: 1.2;
}

.hero__summary {
  display: block;
  margin-top: 16px;
  color: var(--text-secondary);
  font-size: 17px;
  line-height: 1.6;
}

.panel {
  margin-top: 40px;
  padding: 24px;
  border-radius: 8px;
  background: var(--surface-elevated);
}

.panel__title {
  display: block;
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 600;
  line-height: 1.4;
}

.checklist {
  margin-top: 16px;
}

.checklist__item {
  display: flex;
  align-items: center;
  min-height: 44px;
  gap: 12px;
}

.checklist__dot {
  width: 8px;
  height: 8px;
  border-radius: 8px;
  background: var(--accent-primary);
}

.checklist__text,
.notice__body {
  color: var(--text-secondary);
  font-size: 16px;
  line-height: 1.6;
}

.notice {
  margin-top: 24px;
  padding: 20px;
  border-radius: 8px;
  background: var(--surface-secondary);
}

.notice__body {
  display: block;
  margin-top: 8px;
}
</style>
