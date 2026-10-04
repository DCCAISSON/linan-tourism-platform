<script setup lang="ts">
import { ref } from "vue"

type ConsultationSource = "activity" | "business" | "order" | "pretrip"

type ConsultationContext = {
  readonly source: ConsultationSource
  readonly id: string
}

type ConsultationTopic = {
  readonly id: string
  readonly label: string
}

const props = defineProps<{
  readonly context?: ConsultationContext
}>()

const visible = ref(false)
const topics: readonly ConsultationTopic[] = [
  { id: "itinerary", label: "行程与集合安排" },
  { id: "enrollment", label: "报名与费用说明" },
  { id: "pretrip", label: "订单与行前准备" },
]

function open(): void {
  visible.value = true
}

function close(): void {
  visible.value = false
}

function sessionFrom(topic: ConsultationTopic): string {
  return JSON.stringify({ source: props.context?.source ?? "unknown", id: props.context?.id ?? "", topic: topic.id })
}
</script>

<template>
  <view class="consultation-entry">
    <button class="button-secondary consultation-entry__trigger" @tap="open">咨询</button>

    <view v-if="visible" class="consultation-sheet" @tap="close">
      <view class="consultation-sheet__panel" @tap.stop>
        <view class="consultation-sheet__heading">
          <view>
            <text class="consultation-sheet__title">想了解什么？</text>
            <text class="consultation-sheet__hint">选择一个主题后，即可打开微信客服。</text>
          </view>
          <button class="consultation-sheet__close" aria-label="关闭咨询" @tap="close">关闭</button>
        </view>
        <button
          v-for="topic in topics"
          :key="topic.id"
          class="consultation-sheet__topic"
          open-type="contact"
          :session-from="sessionFrom(topic)"
          :show-message-card="true"
          :send-message-title="`咨询：${topic.label}`"
        >{{ topic.label }}</button>
      </view>
    </view>
  </view>
</template>

<style>
.consultation-entry { display: block; }
.consultation-entry__trigger { width: 100%; margin: 0; }
.consultation-sheet { position: fixed; z-index: var(--layer-modal); inset: 0; display: flex; align-items: flex-end; background: var(--overlay-scrim); }
.consultation-sheet__panel { box-sizing: border-box; width: 100%; padding: var(--space-5) var(--space-4) calc(var(--space-4) + env(safe-area-inset-bottom)); border-radius: var(--radius-card) var(--radius-card) 0 0; background: var(--surface-elevated); }
.consultation-sheet__heading { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-4); }
.consultation-sheet__title { display: block; color: var(--text-primary); font-size: var(--font-h3); font-weight: 600; line-height: 1.4; }
.consultation-sheet__hint { display: block; margin-top: var(--space-1); color: var(--text-secondary); font-size: var(--font-body-sm); line-height: 1.5; }
.consultation-sheet__close { display: flex; align-items: center; justify-content: center; flex-shrink: 0; min-width: var(--size-touch-target); min-height: var(--size-touch-target); margin: 0; padding: var(--space-2); border: 0; background: transparent; color: var(--text-secondary); font-size: var(--font-body-sm); line-height: 1.5; }
.consultation-sheet__topic { display: flex; align-items: center; justify-content: center; width: 100%; min-height: var(--size-touch-target); margin-top: var(--space-2); border: 1px solid var(--border-default); border-radius: var(--radius-control); background: var(--surface-primary); color: var(--text-primary); font-size: var(--font-body); line-height: 1.5; text-align: center; }
.consultation-sheet__close::after, .consultation-sheet__topic::after { border: 0; }
</style>
