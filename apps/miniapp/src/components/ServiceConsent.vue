<script setup lang="ts">
import { ref, watch } from "vue"
import { onShow } from "@dcloudio/uni-app"
import { acceptServiceConsent, declineServiceConsent, hasServiceConsent } from "../service-consent"

declare const wx: {
  readonly openPrivacyContract?: (options: UniNamespace.OpenPrivacyContractOption) => void
  readonly requirePrivacyAuthorize?: (options: { readonly success: () => void; readonly fail: () => void }) => void
}
const props = withDefaults(defineProps<{ readonly required?: boolean }>(), { required: false })
const emit = defineEmits<{ accepted: []; declined: [] }>()
const visible = ref(false), details = ref(false), error = ref("")
const busy = ref(false)
function refresh(): void { visible.value = props.required && !hasServiceConsent() }
watch(() => props.required, refresh, { immediate: true })
onShow(refresh)

function accept(): void {
  if (busy.value) return
  if (typeof wx === "undefined" || typeof wx.requirePrivacyAuthorize !== "function") {
    error.value = "请使用新版微信确认隐私授权，您也可以先浏览活动。"; return
  }
  busy.value = true; error.value = ""
  wx.requirePrivacyAuthorize({
    success: () => {
      try { acceptServiceConsent(); visible.value = false; emit("accepted") }
      catch (cause) { error.value = cause instanceof Error ? "选择未能保存，请重试。" : "暂时无法保存，请重试。" }
      finally { busy.value = false }
    },
    fail: () => { busy.value = false; error.value = "尚未同意隐私授权，您可以继续浏览。" },
  })
}
function decline(): void {
  if (busy.value) return
  try { declineServiceConsent(); visible.value = false; emit("declined") }
  catch (cause) { error.value = cause instanceof Error ? "选择未能保存，请重试。" : "暂时无法保存，请重试。" }
}
function openPrivacy(): void {
  if (typeof wx === "undefined" || typeof wx.openPrivacyContract !== "function") {
    error.value = "请在微信中查看隐私保护指引。"; return
  }
  wx.openPrivacyContract({ fail: () => { error.value = "隐私保护指引暂时无法打开，请稍后重试。" } })
}
</script>

<template>
  <view v-if="visible" class="service-consent-mask" @touchmove.stop.prevent>
    <view class="service-consent-dialog" role="dialog" aria-modal="true" aria-label="临安旅游通隐私政策">
      <text class="service-consent-title">临安旅游通隐私政策</text>
      <scroll-view scroll-y class="service-consent-content">
        <text class="service-consent-copy">请阅读《隐私保护指引》和《报名服务说明》，了解个人信息的收集、使用、保存与保护方式。</text>
        <view class="service-consent-links">
          <button @tap="openPrivacy">《隐私保护指引》</button>
          <button @tap="details = !details">《报名服务说明》{{ details ? ' 收起' : ' 查看' }}</button>
        </view>
        <text class="service-consent-copy">我们根据登录、报名和出行服务的需要，处理您的账号资料、联系方式、参加人身份信息及订单记录。</text>
        <text class="service-consent-copy">未成年人信息由监护人提供和确认；健康等敏感信息在填写时单独征求同意。</text>
        <text class="service-consent-copy">肖像使用：您同意我们拍摄、保存活动中含您或您所监护参加人肖像的照片、视频，用于活动记录，并向本团参加人及其监护人展示。公开宣传用途另行征得同意。如需撤回授权，请通过隐私保护指引中的联系方式提出。</text>
        <text class="service-consent-copy">个人信息管理及联系渠道详见隐私保护指引。</text>
        <template v-if="details">
          <text class="service-consent-copy">您可以先浏览活动。登录时，手机号用于确认身份和联系报名人；头像、昵称由您自行选择，用于个人页面展示，目前保存在本机。</text>
          <text class="service-consent-copy">报名时，请确认参营日期、费用及参加人信息，并阅读所选团期的报名须知和退费说明。未成年人由监护人办理报名。</text>
          <text class="service-consent-copy">报名草稿保存在本机，可在报名页清除。健康信息在填写时单独征求同意，消息提醒由您自行选择。</text>
        </template>
        <text v-if="error" class="service-consent-error" aria-live="polite">{{ error }}</text>
      </scroll-view>
      <view class="service-consent-actions">
        <button class="service-consent-decline" :disabled="busy" @tap="decline">仅浏览</button>
        <button class="service-consent-accept" :disabled="busy" @tap="accept">{{ busy ? '正在确认…' : '同意并继续' }}</button>
      </view>
    </view>
  </view>
</template>

<style scoped>
.service-consent-mask { position: fixed; inset: 0; z-index: var(--layer-consent); display: flex; align-items: center; justify-content: center; padding: var(--space-5); background: var(--overlay-scrim); }
.service-consent-dialog { box-sizing: border-box; width: 100%; max-width: var(--sheet-max-width); padding: var(--space-5); border-radius: var(--radius-banner); background: var(--surface-elevated); }
.service-consent-title { display: block; margin-bottom: var(--space-4); font-size: var(--font-h2); font-weight: 600; color: var(--text-primary); text-align: center; line-height: 1.4; }
.service-consent-content { max-height: 60vh; }
.service-consent-copy { display: block; margin-bottom: var(--space-3); font-size: var(--font-body); color: var(--text-primary); line-height: 1.7; }
.service-consent-links button { margin: 0; padding: var(--space-2) 0; min-height: var(--size-touch-target); background: transparent; color: var(--accent-primary); font-size: var(--font-body-sm); text-align: left; line-height: 1.5; }
.service-consent-actions { display: flex; gap: var(--space-3); margin-top: var(--space-4); }
.service-consent-actions button { display: flex; align-items: center; justify-content: center; flex: 1; min-height: var(--size-touch-target); margin: 0; padding: var(--space-3) var(--space-2); font-size: var(--font-body-sm); line-height: 1.5; border-radius: var(--radius-control); }
.service-consent-decline { color: var(--text-secondary); background: var(--surface-secondary); }
.service-consent-accept { color: var(--on-accent); background: var(--accent-primary); }
.service-consent-dialog button::after { border: 0; }
.service-consent-error { display: block; font-size: var(--font-body-sm); color: var(--status-error); }
</style>
