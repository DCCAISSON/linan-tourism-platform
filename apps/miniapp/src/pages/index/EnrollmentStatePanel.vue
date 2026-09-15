<script setup lang="ts">
defineProps<{
  readonly kind: "loading" | "empty" | "error"
  readonly message?: string
}>()

defineEmits<{
  readonly retry: []
}>()
</script>

<template>
  <view class="state-panel" :class="`state-panel--${kind}`" aria-live="polite">
    <template v-if="kind === 'loading'">
      <text class="state-panel__title">正在加载可报名信息</text>
      <text class="state-panel__body">系统正在读取学校、年级、班级和团期。</text>
    </template>

    <template v-else-if="kind === 'empty'">
      <text class="state-panel__title">暂无可报名团期</text>
      <text class="state-panel__body">当前没有开放报名的学校或团期，请稍后再试。</text>
      <button class="secondary-button" @tap="$emit('retry')">重新加载</button>
    </template>

    <template v-else>
      <text class="state-panel__title">加载失败</text>
      <text class="state-panel__body">{{ message }}</text>
      <button class="secondary-button" @tap="$emit('retry')">重新加载</button>
    </template>
  </view>
</template>

<style scoped>
.state-panel {
  box-sizing: border-box;
  margin-top: 24px;
  padding: 20px;
  border-radius: 8px;
  background: var(--surface-elevated);
}

.state-panel--error {
  border: 1px solid var(--status-error);
}

.state-panel__title {
  display: block;
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 600;
  line-height: 1.4;
}

.state-panel__body {
  display: block;
  margin-top: 8px;
  color: var(--text-secondary);
  font-size: 16px;
  line-height: 1.6;
}

.secondary-button {
  min-height: 44px;
  margin-top: 16px;
  border-radius: 8px;
  color: var(--accent-primary);
  font-size: 16px;
  line-height: 44px;
  background: var(--surface-secondary);
}
</style>
