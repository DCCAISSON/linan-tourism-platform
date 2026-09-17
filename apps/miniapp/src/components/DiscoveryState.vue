<script setup lang="ts">
import type { LoadState } from "../enrollment-flow"
defineProps<{ readonly state: LoadState; readonly message?: string; readonly emptyTitle?: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <view v-if="state !== 'ready'" class="discovery-state" aria-live="polite">
    <text class="card-title">{{ state === 'loading' ? '正在加载' : state === 'error' ? '加载失败' : (emptyTitle ?? '暂无活动') }}</text>
    <text class="body-secondary">{{ state === 'error' ? message : state === 'loading' ? '请稍候，正在获取最新信息。' : '有新内容后会在这里展示。' }}</text>
    <button v-if="state === 'error' || state === 'empty'" class="button-secondary retry-button" @tap="$emit('retry')">重新加载</button>
  </view>
</template>

<style>
@import "../styles/discovery.css";
</style>
