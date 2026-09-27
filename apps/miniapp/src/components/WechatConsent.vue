<script setup lang="ts">
import { ref } from "vue"
import FunctionalIcon from "./FunctionalIcon.vue"
import { createMiniappApi } from "../api"
import { readableError } from "../pages/index/page-helpers"
withDefaults(defineProps<{
  readonly title?: string
  readonly loginLabel?: string
}>(), {
  title: "登录后继续办理",
  loginLabel: "微信登录",
})
const emit = defineEmits<{ authenticated: [] }>()
const accepted = ref(false)
const busy = ref(false)
const error = ref("")
const expanded = ref(false)
async function login(): Promise<void> {
  if (!accepted.value || busy.value) return
  busy.value = true
  error.value = ""
  try {
    const code = await new Promise<string>((resolve, reject) => {
      uni.login({ provider: "weixin", success: (result) => {
        if (typeof result.code === "string" && result.code.length > 0) resolve(result.code)
        else reject(new Error("微信登录未返回有效凭证"))
      }, fail: reject })
    })
    await createMiniappApi().loginWithWechatCode(code)
    emit("authenticated")
  } catch (cause) { error.value = readableError(cause, "微信登录失败，请重试") }
  finally { busy.value = false }
}
</script>
<template>
  <view class="consent-card">
    <view class="consent-symbol"><FunctionalIcon name="people" /></view>
    <text class="consent-title">{{ title }}</text>
    <text class="consent-copy">使用微信登录，方便管理报名和订单。</text>
    <button class="consent-details-toggle" :aria-expanded="expanded" @tap="expanded = !expanded">{{ expanded ? "收起信息使用说明" : "查看信息使用说明" }}</button>
    <view v-if="expanded" class="consent-details">
      <text>姓名用于报名核对，证件号码用于出行保险，联系电话用于行前联系。</text>
      <text>常用参加人仅在您选择保存后保留；订单留存本次报名信息。联系电话不是登录凭证。</text>
    </view>
    <checkbox-group @change="accepted = $event.detail.value.includes('consent')">
      <label class="consent-choice" :class="{ 'consent-choice--on': accepted }">
        <checkbox class="consent-checkbox" value="consent" :checked="accepted" :disabled="busy" color="var(--accent-primary)" />
        <text>同意微信登录与账号管理</text>
      </label>
    </checkbox-group>
    <text v-if="error" class="consent-error">{{ error }}</text>
    <button class="consent-login" :disabled="!accepted || busy" @tap="login">{{ busy ? "正在登录…" : loginLabel }}</button>
  </view>
</template>
<style scoped>
.consent-card { margin-top: var(--space-5); padding: var(--space-5); border-radius: var(--radius-card); background: var(--surface-elevated); }
.consent-symbol { display: inline-flex; padding: var(--space-4); margin-bottom: var(--space-4); border-radius: var(--radius-banner); background: var(--accent-soft); }
.consent-details-toggle { min-height: var(--size-touch-target); padding: 0; margin: 0; text-align: left; background: transparent; color: var(--accent-primary); font-size: var(--font-body-sm); line-height: var(--size-touch-target); }
.consent-details-toggle::after, .consent-login::after { border: 0; }
.consent-details { padding: var(--space-3); border-radius: var(--radius-control); background: var(--surface-secondary); color: var(--text-secondary); font-size: var(--font-body-sm); line-height: 1.6; }
.consent-details text { display: block; }
.consent-details text + text { margin-top: var(--space-2); }
.consent-title, .consent-copy, .consent-error { display: block; }
.consent-title { font-size: var(--font-h3); font-weight: 600; }
.consent-copy { margin-top: var(--space-3); font-size: var(--font-body-sm); line-height: 1.6; color: var(--text-secondary); }
.consent-choice, .consent-login { margin-top: var(--space-4); padding: var(--space-3); min-height: var(--size-touch-target); border-radius: var(--radius-control); font-size: var(--font-body); line-height: 1.5; }
.consent-choice { display: flex; align-items: flex-start; gap: var(--space-2); box-sizing: border-box; text-align: left; border: 1px solid var(--border-default); color: var(--text-secondary); background: var(--surface-primary); }
.consent-checkbox { flex: 0 0 auto; }
.consent-choice > text { min-width: 0; overflow-wrap: anywhere; }
.consent-choice--on { color: var(--accent-primary); border-color: var(--accent-primary); background: var(--accent-soft); }
.consent-login { color: var(--on-accent); background: var(--accent-primary); }
.consent-login[disabled] { opacity: 0.5; }
.consent-error { margin-top: var(--space-3); color: var(--status-error); font-size: var(--font-body-sm); }
</style>
