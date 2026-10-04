<script setup lang="ts">
import { ref } from "vue"
import type { UserNotificationTemplate } from "../user-notification-api"

const props = defineProps<{ readonly templates: readonly UserNotificationTemplate[]; readonly busy: boolean }>()
const emit = defineEmits<{ receive: [ids: readonly string[]]; skip: [] }>()
const selected = ref(props.templates.map(item => item.templateId))
function change(event: { readonly detail: { readonly value: string[] } }): void { selected.value = event.detail.value }
function receive(): void { if (!props.busy) emit("receive", selected.value) }
function skip(): void { if (!props.busy) emit("skip") }
</script>

<template>
  <view class="subscription-mask" @touchmove.stop.prevent>
    <view class="subscription-dialog" role="dialog" aria-modal="true" aria-label="接收消息提醒">
      <text class="subscription-title">接收消息提醒</text>
      <text class="subscription-copy">{{ templates.length ? '选择需要接收的通知' : '消息提醒暂时无法开启，可先完成登录，稍后在设置中重试。' }}</text>
      <checkbox-group v-if="templates.length" class="subscription-options" @change="change">
        <label v-for="item in templates" :key="item.templateId" class="subscription-option">
          <checkbox :value="item.templateId" :checked="selected.includes(item.templateId)" :disabled="busy" color="var(--accent-primary)" />
          <text>{{ item.title }}</text>
        </label>
      </checkbox-group>
      <text v-if="templates.length" class="subscription-copy">可自行取消勾选，跳过不影响登录。</text>
      <view class="subscription-actions">
        <button class="subscription-skip" :disabled="busy" @tap="skip">暂时跳过</button>
        <button class="subscription-receive" :disabled="busy" @tap="receive">{{ busy ? '正在确认…' : selected.length ? '接收提醒' : '完成登录' }}</button>
      </view>
    </view>
  </view>
</template>

<style scoped>
.subscription-mask { position: fixed; inset: 0; z-index: var(--layer-consent); display: flex; align-items: center; justify-content: center; padding: var(--space-5); background: var(--overlay-scrim); }
.subscription-dialog { box-sizing: border-box; width: 100%; max-width: var(--sheet-max-width); padding: var(--space-5); border-radius: var(--radius-banner); background: var(--surface-elevated); }
.subscription-title { display: block; margin-bottom: var(--space-4); color: var(--text-primary); font-size: var(--font-h2); font-weight: 600; text-align: center; }
.subscription-copy { display: block; color: var(--text-secondary); font-size: var(--font-body-sm); line-height: 1.6; }
.subscription-options { display: block; margin: var(--space-4) 0; }
.subscription-option { display: flex; align-items: center; gap: var(--space-2); min-height: var(--size-touch-target); color: var(--text-primary); font-size: var(--font-body); }
.subscription-option checkbox { flex-shrink: 0; }
.subscription-actions { display: flex; gap: var(--space-3); margin-top: var(--space-5); }
.subscription-actions button { display: flex; align-items: center; justify-content: center; flex: 1; min-height: var(--size-touch-target); margin: 0; padding: var(--space-3) var(--space-2); border-radius: var(--radius-control); font-size: var(--font-body-sm); line-height: 1.5; }
.subscription-actions button::after { border: 0; }
.subscription-skip { color: var(--text-secondary); background: var(--surface-secondary); }
.subscription-receive { color: var(--on-accent); background: var(--accent-primary); }
</style>
