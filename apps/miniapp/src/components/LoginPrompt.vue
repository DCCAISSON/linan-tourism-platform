<script setup lang="ts">
import FunctionalIcon from "./FunctionalIcon.vue"
withDefaults(defineProps<{ readonly message?: string }>(), { message: "登录后，继续为您办理报名" })
defineEmits<{ cancel: []; confirm: [] }>()
</script>
<template>
  <view class="login-prompt-mask" @touchmove.stop.prevent>
    <view class="login-prompt" role="dialog" aria-modal="true" aria-label="登录提示">
      <view class="login-prompt-icon"><FunctionalIcon name="people" /></view>
      <text class="login-prompt-title">{{ message }}</text>
      <text class="login-prompt-copy">微信登录后，查看报名和参加人。</text>
      <view class="login-prompt-actions">
        <button class="button-secondary login-prompt-cancel" @tap="$emit('cancel')">再逛会</button>
        <button class="button-primary login-prompt-confirm" @tap="$emit('confirm')">去登录</button>
      </view>
    </view>
  </view>
</template>
<style scoped>
.login-prompt-mask { position: fixed; inset: 0; z-index: var(--layer-modal); display: flex; align-items: center; justify-content: center; padding: var(--space-6); background: var(--overlay-scrim); }
.login-prompt { box-sizing: border-box; width: 100%; max-width: var(--dialog-max-width); padding: var(--space-6); border-radius: var(--radius-banner); text-align: center; background: var(--surface-elevated); }
.login-prompt-icon { display: inline-flex; padding: var(--space-4); border-radius: var(--radius-banner); background: var(--accent-soft); }
.login-prompt-title { display: block; margin-top: var(--space-5); color: var(--text-primary); font-size: var(--font-h3); line-height: 1.5; font-weight: 600; }
.login-prompt-copy { display: block; margin-top: var(--space-3); color: var(--text-secondary); font-size: var(--font-body-sm); line-height: 1.6; }
.login-prompt-actions { display: flex; gap: var(--space-3); margin-top: var(--space-6); }
.login-prompt-actions button { flex: 1; min-width: 0; }
.button-primary, .button-secondary { box-sizing: border-box; min-height: var(--size-touch-target); margin: 0; padding: 0 var(--space-3); border-radius: var(--radius-control); font-size: var(--font-body); line-height: var(--size-touch-target); }
.button-primary { color: var(--on-accent); background: var(--accent-primary); }
.button-secondary { color: var(--accent-primary); background: var(--accent-soft); }
.button-primary::after, .button-secondary::after { border: 0; }
.button-primary:active, .button-secondary:active { transform: scale(.98); }
.button-primary:focus-visible, .button-secondary:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
</style>
