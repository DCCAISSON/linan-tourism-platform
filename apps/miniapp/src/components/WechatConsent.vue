<script setup lang="ts">
import { ref } from "vue"
import { createMiniappApi } from "../api"
import { readableError } from "../pages/index/page-helpers"
withDefaults(defineProps<{
  readonly title?: string
  readonly loginLabel?: string
}>(), {
  title: "登录后继续办理",
  loginLabel: "同意并微信登录",
})
const emit = defineEmits<{ authenticated: [] }>()
const accepted = ref(false)
const busy = ref(false)
const error = ref("")
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
    <text class="consent-title">{{ title }}</text>
    <text class="consent-copy">登录将使用微信身份识别您的账号。报名时填写的姓名、证件号码和联系方式用于报名核对、出行保险及行前联系。常用参加人仅在您主动选择保存后保留，订单按本次报名信息留存。</text>
    <checkbox-group @change="accepted = $event.detail.value.includes('consent')">
      <label class="consent-choice" :class="{ 'consent-choice--on': accepted }">
        <checkbox class="consent-checkbox" value="consent" :checked="accepted" :disabled="busy" color="var(--accent-primary)" />
        <text>我已知悉并同意上述必要信息处理</text>
      </label>
    </checkbox-group>
    <text v-if="error" class="consent-error">{{ error }}</text>
    <button class="consent-login" :disabled="!accepted || busy" @tap="login">{{ busy ? "正在登录…" : loginLabel }}</button>
  </view>
</template>
<style scoped>
.consent-card { margin-top: var(--space-5); padding: var(--space-5); border-radius: var(--radius-card); background: var(--surface-elevated); }
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
