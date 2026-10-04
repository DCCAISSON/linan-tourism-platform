<script setup lang="ts">
import { ref } from "vue"
import FunctionalIcon from "./FunctionalIcon.vue"
import { createMiniappApi, type WechatLoginResponse } from "../api"
import { createUserNotificationApi, requestUserSubscriptions, type UserNotificationTemplate, type SubscriptionChoice } from "../user-notification-api"
import { getWechatSessionToken } from "../wechat-token"
import { readableError } from "../pages/index/page-helpers"

declare const wx: { readonly openPrivacyContract?: (options: UniNamespace.OpenPrivacyContractOption) => void }

const props = withDefaults(defineProps<{ readonly title?: string; readonly promptSubscriptions?: boolean }>(), { title: "登录后继续办理", promptSubscriptions: true })
const emit = defineEmits<{ identified: [response: WechatLoginResponse, phone?: string]; authenticated: [] }>()
const accepted = ref(false), busy = ref(false), error = ref("")
const subscriptionTemplates = ref<readonly UserNotificationTemplate[]>([]), pendingChoices = ref<readonly SubscriptionChoice[]>([])
let ownerToken: string | undefined
let completedLogin: WechatLoginResponse | undefined

function sameAccount(): boolean {
  if (ownerToken !== undefined && ownerToken === getWechatSessionToken()) return true
  subscriptionTemplates.value = []; pendingChoices.value = []
  error.value = "登录信息已变更，请重新确认手机号。"
  return false
}
function requireConsent(): boolean {
  if (accepted.value) return true
  error.value = "请先阅读并勾选同意。"
  return false
}
async function readLoginCode(): Promise<string> {
  return await new Promise((resolve, reject) => uni.login({ provider: "weixin", success: result => typeof result.code === "string" && result.code.length > 0 ? resolve(result.code) : reject(new Error("暂时无法确认微信身份，请重试。")), fail: reject }))
}
async function complete(response: WechatLoginResponse, identify = false, verifiedPhone?: string): Promise<void> {
  ownerToken = getWechatSessionToken()
  if (!sameAccount()) return
  completedLogin = response
  if (identify) emit("identified", response, verifiedPhone)
  if (props.promptSubscriptions) {
    try {
      const rows = await createUserNotificationApi().overview()
      if (!sameAccount()) return
      subscriptionTemplates.value = ["enrollment", "activity"].flatMap(category => {
        const template = rows.find(item => item.category === category && item.enabled && item.subscription?.status !== "active")
        return template === undefined ? [] : [template]
      })
      if (subscriptionTemplates.value.length > 0) return
    } catch (cause) {
      if (!sameAccount()) return
      uni.showToast({ title: readableError(cause, "暂时无法设置消息提醒，可稍后在“我的”中查看。"), icon: "none" })
    }
  }
  emitAuthenticated()
}
function emitAuthenticated(): void { if (completedLogin !== undefined) emit("authenticated") }
async function loginWithWechatPhone(event: { readonly detail?: { readonly code?: unknown; readonly phoneNumber?: unknown } }): Promise<void> {
  if (!requireConsent() || busy.value || subscriptionTemplates.value.length > 0) return
  const phoneCode = event.detail?.code
  if (typeof phoneCode !== "string" || phoneCode.length === 0) { error.value = "未获得微信手机号授权，请重新点击。"; return }
  busy.value = true; error.value = ""
  try { await complete(await createMiniappApi().loginWithWechatPhone(await readLoginCode(), phoneCode), true, typeof event.detail?.phoneNumber === "string" ? event.detail.phoneNumber : undefined) }
  catch (cause) { error.value = readableError(cause, "微信手机号登录失败，请重新授权。") }
  finally { busy.value = false }
}
function skipSubscription(): void { if (!busy.value && subscriptionTemplates.value.length > 0 && sameAccount()) { subscriptionTemplates.value = []; pendingChoices.value = []; emitAuthenticated() } }
async function subscribe(): Promise<void> {
  if (busy.value || subscriptionTemplates.value.length === 0 || !sameAccount()) return
  busy.value = true; error.value = ""
  try {
    if (pendingChoices.value.length === 0) pendingChoices.value = await requestUserSubscriptions(subscriptionTemplates.value)
    if (!sameAccount()) return
    const loginCode = await readLoginCode()
    if (!sameAccount()) return
    await createUserNotificationApi().subscribe(loginCode, pendingChoices.value)
    if (!sameAccount()) return
    subscriptionTemplates.value = []; pendingChoices.value = []; emitAuthenticated()
  } catch (cause) { if (sameAccount()) error.value = readableError(cause, "消息提醒未保存，可重试或暂不接收。") }
  finally { busy.value = false }
}
function openPrivacy(): void {
  error.value = ""
  if (typeof wx === "undefined" || typeof wx.openPrivacyContract !== "function") { error.value = "暂时无法查看隐私保护指引，请在微信中重试。"; return }
  wx.openPrivacyContract({ fail: () => { error.value = "隐私保护指引暂时无法打开，请稍后重试。" } })
}
</script>

<template>
  <view class="consent-card">
    <template v-if="subscriptionTemplates.length > 0">
      <text class="consent-title">登录成功，要接收行程提醒吗？</text><text class="consent-copy">{{ subscriptionTemplates.map(item => item.title).join("、") }}</text>
      <text v-if="error" class="consent-error" aria-live="polite">{{ error }}</text>
      <button class="consent-login" :disabled="busy" @tap="subscribe">{{ busy ? "正在处理…" : "接收提醒" }}</button><button class="consent-skip" :disabled="busy" @tap="skipSubscription">暂不接收，继续</button>
    </template>
    <template v-else>
      <view class="consent-symbol"><FunctionalIcon name="people" /></view><text class="consent-title">{{ title }}</text>
      <text class="consent-copy">请点击下方按钮，授权微信手机号登录。</text><button class="consent-privacy-entry" @tap="openPrivacy">查看隐私保护指引</button>
      <checkbox-group @change="accepted = $event.detail.value.includes('consent')"><label class="consent-choice" :class="{ 'consent-choice--on': accepted }"><checkbox class="consent-checkbox" value="consent" :checked="accepted" :disabled="busy" color="var(--accent-primary)" /><text>我已阅读并同意相关协议和隐私保护指引。登录即表示同意。</text></label></checkbox-group>
      <button open-type="getPhoneNumber" class="consent-login" :disabled="!accepted || busy" @getphonenumber="loginWithWechatPhone">微信手机号快捷登录</button>
      <text v-if="error" class="consent-error" aria-live="polite">{{ error }}</text>
    </template>
  </view>
</template>

<style scoped>
.consent-card { margin-top: var(--space-5); padding: var(--space-5); border-radius: var(--radius-card); background: var(--surface-elevated); }.consent-symbol { display: inline-flex; padding: var(--space-4); margin-bottom: var(--space-4); border-radius: var(--radius-banner); background: var(--accent-soft); }.consent-title, .consent-copy, .consent-error { display: block; }.consent-title { color: var(--text-primary); font-size: var(--font-h3); font-weight: 600; }.consent-copy { margin-top: var(--space-3); color: var(--text-secondary); font-size: var(--font-body-sm); line-height: 1.6; }.consent-privacy-entry { min-height: var(--size-touch-target); padding: 0; margin: var(--space-2) 0 0; color: var(--accent-primary); font-size: var(--font-body-sm); line-height: var(--size-touch-target); text-align: left; background: transparent; }.consent-privacy-entry::after, .consent-login::after, .consent-skip::after { border: 0; }.consent-choice, .consent-login, .consent-skip { box-sizing: border-box; width: 100%; min-height: var(--size-touch-target); margin-top: var(--space-3); border-radius: var(--radius-control); font-size: var(--font-body); line-height: 1.5; }.consent-choice { display: flex; gap: var(--space-2); padding: var(--space-3); text-align: left; border: 1px solid var(--border-default); color: var(--text-secondary); background: var(--surface-primary); }.consent-checkbox { flex: 0 0 auto; }.consent-choice--on { color: var(--accent-primary); border-color: var(--accent-primary); background: var(--accent-soft); }.consent-login { color: var(--on-accent); background: var(--accent-primary); }.consent-skip { color: var(--text-secondary); background: var(--surface-secondary); }.consent-login[disabled], .consent-skip[disabled] { opacity: 0.5; }.consent-error { margin-top: var(--space-3); color: var(--status-error); font-size: var(--font-body-sm); }
</style>
