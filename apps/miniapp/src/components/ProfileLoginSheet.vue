<script setup lang="ts">
import { onUnmounted, ref } from "vue"
import { createMiniappApi, type WechatLoginResponse } from "../api"
import { discardPersistedAvatar, loadLocalProfile, persistAvatar, saveLocalProfile } from "../profile-display"
import { hasServiceConsent } from "../service-consent"
import { createUserNotificationApi, requestUserSubscriptions, type UserNotificationTemplate } from "../user-notification-api"
import { clearWechatSessionTokenIfCurrent, getEnrollmentDraftOwner, getWechatSessionToken } from "../wechat-token"
import ServiceConsent from "./ServiceConsent.vue"
import SubscriptionPrompt from "./SubscriptionPrompt.vue"

declare const wx: { readonly openPrivacyContract?: (options: UniNamespace.OpenPrivacyContractOption) => void }

const props = withDefaults(defineProps<{ readonly requirePhone?: boolean; readonly title?: string }>(), {
  requirePhone: true,
  title: "确认登录身份",
})
const emit = defineEmits<{ completed: [response: WechatLoginResponse, phone?: string]; saved: []; cancelled: [] }>()
const api = createMiniappApi()
const serviceAllowed = ref(hasServiceConsent())
const privacyVisible = ref(!serviceAllowed.value)
const subscriptionVisible = ref(false)
const phoneAuthorized = ref(!props.requirePhone)
const busy = ref(false)
const error = ref("")
const owner = ref("")
const response = ref<WechatLoginResponse | null>(null)
const verifiedPhone = ref<string | undefined>()
const nickname = ref("")
const avatarPath = ref("")
const avatarTempPath = ref("")
const templates = ref<readonly UserNotificationTemplate[]>([])
const sheetTitle = props.title ?? "完善个人资料"
let disposed = false
let sessionCommitted = false

onUnmounted(() => {
  disposed = true
  if (!sessionCommitted && response.value !== null) clearWechatSessionTokenIfCurrent(response.value.token)
})

if (!props.requirePhone && serviceAllowed.value) loadProfile(getEnrollmentDraftOwner())

function loadProfile(nextOwner: string, preserveDraft = false): void {
  owner.value = nextOwner
  const profile = loadLocalProfile(nextOwner)
  if (!preserveDraft || nickname.value.length === 0) nickname.value = profile?.nickname ?? ""
  if (!preserveDraft || (avatarPath.value.length === 0 && avatarTempPath.value.length === 0)) avatarPath.value = profile?.avatarPath ?? ""
  if (!preserveDraft) avatarTempPath.value = ""
}

function allowService(): void {
  serviceAllowed.value = true
  privacyVisible.value = false
  if (!props.requirePhone) loadProfile(getEnrollmentDraftOwner())
}
function requestPrivacy(): void { if (!busy.value && !serviceAllowed.value) privacyVisible.value = true }

function openPrivacy(): void {
  if (typeof wx === "undefined" || typeof wx.openPrivacyContract !== "function") {
    error.value = "请在微信中查看隐私保护指引。"
    return
  }
  wx.openPrivacyContract({ fail: () => { error.value = "隐私保护指引暂时无法打开，请稍后重试。" } })
}

function isCurrentSession(expectedOwner: string, expectedToken: string | undefined): boolean {
  return !disposed && expectedOwner === getEnrollmentDraftOwner() && expectedToken === getWechatSessionToken()
}

function cancel(): void {
  if (busy.value) return
  if (subscriptionVisible.value) { finishLogin(); return }
  if (response.value !== null) clearWechatSessionTokenIfCurrent(response.value.token)
  emit("cancelled")
}

function chooseAvatar(event: { readonly detail?: { readonly avatarUrl?: unknown } }): void {
  if (!serviceAllowed.value) return
  const path = event.detail?.avatarUrl
  if (typeof path === "string" && path.length > 0) avatarTempPath.value = path
}

function updateNickname(event: Event): void {
  if (!serviceAllowed.value) return
  const detail = "detail" in event ? event.detail : undefined
  const value = typeof detail === "object" && detail !== null && "value" in detail ? detail.value : undefined
  if (typeof value === "string") nickname.value = value
}

async function authorizePhone(event: { readonly detail?: { readonly code?: unknown; readonly phoneNumber?: unknown } }): Promise<void> {
  if (!serviceAllowed.value || busy.value || phoneAuthorized.value) return
  const phoneCode = event.detail?.code
  if (typeof phoneCode !== "string" || phoneCode.length === 0) { error.value = "未获得微信手机号授权，请重新点击。"; return }
  const expectedOwner = getEnrollmentDraftOwner(), expectedToken = getWechatSessionToken()
  busy.value = true; error.value = ""
  try {
    const loginCode = await readLoginCode()
    if (!isCurrentSession(expectedOwner, expectedToken)) { error.value = "登录信息已变更，请重新打开登录。"; return }
    const nextResponse = await api.loginWithWechatPhone(loginCode, phoneCode)
    if (disposed) { clearWechatSessionTokenIfCurrent(nextResponse.token); return }
    const nextOwner = `family:${nextResponse.familyCode}`
    if (getEnrollmentDraftOwner() !== nextOwner || getWechatSessionToken() !== nextResponse.token) { error.value = "登录信息已变更，请重新确认手机号。"; return }
    response.value = nextResponse
    verifiedPhone.value = typeof event.detail?.phoneNumber === "string" && event.detail.phoneNumber.length > 0 ? event.detail.phoneNumber : undefined
    phoneAuthorized.value = true
    loadProfile(nextOwner, true)
    await loadTemplates()
  } catch {
    error.value = "微信手机号登录失败，请重新授权。"
  } finally {
    busy.value = false
  }
}

async function loadTemplates(): Promise<void> {
  try {
    const rows = await createUserNotificationApi().overview()
    if (response.value === null || !isCurrentSession(owner.value, response.value.token)) return
    templates.value = ["enrollment", "activity"].flatMap((category) => {
      const template = rows.find((item) => item.category === category && item.enabled)
      return template === undefined ? [] : [template]
    })
  } catch {
    templates.value = []
  }
}

async function saveProfile(event?: unknown): Promise<void> {
  if (!serviceAllowed.value || busy.value || subscriptionVisible.value || (props.requirePhone && (!phoneAuthorized.value || response.value === null))) return
  const ownerAtStart = owner.value || getEnrollmentDraftOwner()
  const sessionOwnerAtStart = getEnrollmentDraftOwner()
  const sessionTokenAtStart = getWechatSessionToken()
  if (ownerAtStart.length === 0 || ownerAtStart !== sessionOwnerAtStart || (props.requirePhone && response.value?.token !== sessionTokenAtStart)) { error.value = "登录信息已变更，请重新确认手机号。"; return }

  busy.value = true; error.value = ""
  try {
    const persistedAvatar = avatarTempPath.value.length > 0
    const nextAvatar = persistedAvatar ? await persistAvatar(avatarTempPath.value) : avatarPath.value
    if (!isCurrentSession(ownerAtStart, sessionTokenAtStart)) {
      if (persistedAvatar) discardPersistedAvatar(nextAvatar)
      error.value = "登录信息已变更，资料未保存。"
      return
    }
    const detail = typeof event === "object" && event !== null && "detail" in event ? event.detail : undefined
    const values = typeof detail === "object" && detail !== null && "value" in detail ? detail.value : undefined
    const submittedNickname = typeof values === "object" && values !== null && "nickname" in values ? values.nickname : undefined
    const nextNickname = typeof submittedNickname === "string" ? submittedNickname.trim() : nickname.value.trim()
    saveLocalProfile(ownerAtStart, { nickname: nextNickname, avatarPath: nextAvatar })
    nickname.value = nextNickname
    avatarPath.value = nextAvatar
    avatarTempPath.value = ""

    if (props.requirePhone) subscriptionVisible.value = true
    else emit("saved")
  } catch {
    error.value = "头像未能保存到本机，请重新选择后保存。"
  } finally {
    busy.value = false
  }
}

function finishLogin(): void {
  if (sessionCommitted || response.value === null) return
  if (!isCurrentSession(owner.value, response.value.token)) {
    subscriptionVisible.value = false
    error.value = "登录信息已变更，请重新打开登录。"
    return
  }
  subscriptionVisible.value = false
  sessionCommitted = true
  emit("completed", response.value, verifiedPhone.value)
}

async function subscribe(ids: readonly string[]): Promise<void> {
  if (busy.value || !subscriptionVisible.value || response.value === null) return
  const expectedOwner = owner.value, expectedToken = response.value.token
  if (!isCurrentSession(expectedOwner, expectedToken)) { finishLogin(); return }
  const selected = templates.value.filter(item => ids.includes(item.templateId))
  if (selected.length === 0) { finishLogin(); return }
  busy.value = true
  try {
    const choices = await requestUserSubscriptions(selected)
    if (!isCurrentSession(expectedOwner, expectedToken)) return
    const loginCode = await readLoginCode()
    if (!isCurrentSession(expectedOwner, expectedToken)) return
    await createUserNotificationApi().subscribe(loginCode, choices)
  } catch {
    if (isCurrentSession(expectedOwner, expectedToken)) showSubscriptionReminder()
  } finally {
    busy.value = false
    finishLogin()
  }
}

function showSubscriptionReminder(): void {
  error.value = "资料已保存，消息提醒可稍后在设置中管理。"
  uni.showToast({ title: "登录成功，消息提醒可在设置中重试", icon: "none" })
}

async function readLoginCode(): Promise<string> {
  return await new Promise((resolve, reject) => uni.login({ provider: "weixin", success: (result) => typeof result.code === "string" && result.code.length > 0 ? resolve(result.code) : reject(new Error("missing code")), fail: reject }))
}
</script>

<template>
  <view class="profile-sheet-mask" @touchmove.stop.prevent>
    <view class="profile-sheet" role="dialog" aria-modal="true" :aria-label="sheetTitle">
      <ServiceConsent v-if="privacyVisible" required @accepted="allowService" @declined="cancel" />
      <SubscriptionPrompt v-if="subscriptionVisible" :templates="templates" :busy="busy" @receive="subscribe" @skip="finishLogin" />
      <view :aria-hidden="privacyVisible || subscriptionVisible">
        <view class="profile-sheet-heading"><text class="profile-sheet-title">{{ sheetTitle }}</text><button class="profile-sheet-close" :disabled="busy" @tap="cancel">关闭</button></view>
        <text v-if="requirePhone" class="profile-sheet-copy">手机号用于确认登录身份。</text>
        <button class="profile-privacy-link" @tap="openPrivacy">查看隐私保护指引</button>
        <form class="profile-sheet-form" @submit="saveProfile">
          <view class="profile-field">
            <text class="profile-field-label">头像</text>
            <button v-if="serviceAllowed" open-type="chooseAvatar" class="profile-avatar-picker" :disabled="busy || subscriptionVisible" @chooseavatar="chooseAvatar">
              <image v-if="avatarTempPath || avatarPath" class="profile-avatar-image" :src="avatarTempPath || avatarPath" mode="aspectFill" />
              <text v-else>选择头像</text>
            </button>
            <button v-else class="profile-avatar-picker" @tap="requestPrivacy">选择头像</button>
          </view>
          <view class="profile-field">
            <text class="profile-field-label">昵称</text>
            <input v-if="serviceAllowed" name="nickname" :value="nickname" type="nickname" class="profile-nickname-input" :disabled="busy || subscriptionVisible" placeholder="填写昵称（可选）" placeholder-class="input-placeholder" @input="updateNickname" @blur="updateNickname" />
            <button v-else class="profile-nickname-input profile-nickname-gate" @tap="requestPrivacy">填写昵称（可选）</button>
          </view>
          <view v-if="requirePhone" class="profile-field">
            <text class="profile-field-label">手机号</text>
            <button v-if="!serviceAllowed" class="button-primary profile-phone-button" @tap="requestPrivacy">授权微信手机号</button>
            <button v-else-if="!phoneAuthorized" open-type="getPhoneNumber" class="button-primary profile-phone-button" :disabled="busy || subscriptionVisible" @getphonenumber="authorizePhone">授权微信手机号</button>
            <text v-else class="profile-phone-ready">已授权</text>
          </view>
          <text v-else class="profile-sheet-copy">保存后会显示在本机的“我的”页。</text>
          <text v-if="error" class="profile-sheet-error" aria-live="polite">{{ error }}</text>
          <button class="button-primary profile-save-button" form-type="submit" :disabled="busy || !serviceAllowed || subscriptionVisible || (requirePhone === true && phoneAuthorized !== true)">{{ busy ? "正在保存" : "保存并继续" }}</button>
        </form>
      </view>
    </view>
  </view>
</template>

<style scoped>
.profile-sheet-mask { position: fixed; inset: 0; z-index: var(--layer-modal); display: flex; align-items: flex-end; justify-content: center; background: var(--overlay-scrim); }
.profile-sheet { box-sizing: border-box; width: 100%; max-width: var(--sheet-max-width); max-height: 88vh; padding: var(--space-5) var(--space-4) calc(var(--space-5) + env(safe-area-inset-bottom)); overflow-y: auto; border-radius: var(--radius-banner) var(--radius-banner) 0 0; background: var(--surface-elevated); }
.profile-sheet-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.profile-sheet-title { color: var(--text-primary); font-size: var(--font-h3); font-weight: 600; line-height: 1.4; }
.profile-sheet-close { min-height: var(--size-touch-target); margin: 0; padding: 0 var(--space-2); color: var(--text-secondary); background: transparent; font-size: var(--font-body-sm); line-height: var(--size-touch-target); }
.profile-sheet-close::after, .profile-avatar-picker::after { border: 0; }
.profile-privacy-link { display: flex; align-items: center; min-height: var(--size-touch-target); margin: 0; padding: 0; color: var(--accent-primary); background: transparent; font-size: var(--font-body-sm); line-height: 1.5; text-align: left; }
.profile-privacy-link::after { border: 0; }
.profile-sheet-copy, .profile-phone-ready, .profile-sheet-error { display: block; margin-top: var(--space-3); font-size: var(--font-body-sm); line-height: 1.6; }
.profile-sheet-copy, .profile-phone-ready { color: var(--text-secondary); }
.profile-sheet-error { color: var(--status-error); }
.profile-sheet-form { margin-top: var(--space-4); }
.profile-field { display: flex; align-items: center; min-height: var(--size-touch-target); gap: var(--space-3); margin-top: var(--space-3); }
.profile-field-label { flex: 0 0 4em; color: var(--text-primary); font-size: var(--font-body); }
.profile-avatar-picker { display: flex; align-items: center; justify-content: center; width: var(--size-profile-avatar); height: var(--size-profile-avatar); margin: 0; padding: 0; overflow: hidden; border-radius: 50%; color: var(--accent-primary); background: var(--accent-soft); font-size: var(--font-caption); }
.profile-avatar-image { width: 100%; height: 100%; }
.profile-nickname-input { box-sizing: border-box; flex: 1; min-width: 0; min-height: var(--size-touch-target); padding: 0 var(--space-3); border: 1px solid var(--border-default); border-radius: var(--radius-control); color: var(--text-primary); background: var(--surface-primary); font-size: var(--font-body); }
.profile-phone-button { flex: 1; min-width: 0; min-height: var(--size-touch-target); margin: 0; }
.profile-phone-ready { margin: 0; }
.profile-save-button { box-sizing: border-box; width: 100%; min-height: var(--size-touch-target); margin-top: var(--space-3); }
.profile-nickname-gate { flex: 1; display: flex; align-items: center; margin: 0; text-align: left; color: var(--text-tertiary); }
.profile-nickname-gate::after { border: 0; }
</style>
