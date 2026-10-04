<script setup lang="ts">
import { ref } from "vue"
import { onShow } from "@dcloudio/uni-app"
import { createMiniappApi } from "../../api"
import FunctionalIcon from "../../components/FunctionalIcon.vue"
import ProfileLoginSheet from "../../components/ProfileLoginSheet.vue"
import { hasCompletedLocalProfile, loadLocalProfile, type LocalProfile } from "../../profile-display"
import { getEnrollmentDraftOwner, getWechatSessionToken, logoutWechatSession } from "../../wechat-token"

declare const wx: { readonly openPrivacyContract?: (options: UniNamespace.OpenPrivacyContractOption) => void }

const authenticated = ref(false)
const profile = ref<LocalProfile | null>(null)
const profileSheetVisible = ref(false)
const needsPhone = ref(true)
const loggingOut = ref(false)

onShow(refresh)

function refresh(): void {
  const token = getWechatSessionToken()
  authenticated.value = import.meta.env["VITE_WECHAT_LOGIN_ENABLED"] !== "true"
    || (token !== undefined && hasCompletedLocalProfile(getEnrollmentDraftOwner()))
  profile.value = authenticated.value ? loadLocalProfile(getEnrollmentDraftOwner()) : null
}

function openLogin(): void {
  needsPhone.value = true
  profileSheetVisible.value = true
}

function editProfile(): void {
  needsPhone.value = false
  profileSheetVisible.value = true
}

function completeProfile(): void {
  profileSheetVisible.value = false
  refresh()
}

function savedProfile(): void {
  profileSheetVisible.value = false
  refresh()
}

function closeSheet(): void {
  profileSheetVisible.value = false
}

function notifications(): void {
  uni.navigateTo({ url: "/pages/notifications/index" })
}

function privacy(): void {
  if (typeof wx === "undefined" || typeof wx.openPrivacyContract !== "function") {
    uni.showToast({ title: "请在微信中查看隐私保护指引", icon: "none" })
    return
  }
  wx.openPrivacyContract({ fail: () => uni.showToast({ title: "暂时无法打开，请稍后重试", icon: "none" }) })
}

function logout(): void {
  if (loggingOut.value) return
  const session = getWechatSessionToken()
  uni.showModal({
    title: "退出登录？",
    content: "退出后可以继续浏览。本机未提交的报名草稿将清除，已提交的订单会保留。",
    confirmText: "退出登录",
    success: async (result) => {
      if (!result.confirm || session !== getWechatSessionToken()) return
      loggingOut.value = true
      try {
        logoutWechatSession()
        profileSheetVisible.value = false
        authenticated.value = false
        profile.value = null
        uni.switchTab({ url: "/pages/family/index" })
      } catch {
        refresh()
        uni.showToast({ title: "退出未完成，请重试", icon: "none" })
      } finally {
        loggingOut.value = false
      }
      if (session !== undefined) {
        try { await createMiniappApi({ wechatSessionToken: session }).logoutWechat() }
        catch {
          if (getWechatSessionToken() === undefined) uni.showToast({ title: "已退出本机，登录状态暂未同步", icon: "none" })
        }
      }
    },
  })
}
</script>

<template>
  <view class="discovery-page settings-page">
    <view v-if="authenticated" class="info-card settings-profile">
      <image v-if="profile?.avatarPath" class="settings-avatar" :src="profile.avatarPath" mode="aspectFill" />
      <view v-else class="settings-avatar settings-avatar-placeholder"><FunctionalIcon name="people" /></view>
      <view class="settings-profile-copy"><text class="card-title">{{ profile?.nickname || "我的资料" }}</text><text class="body-secondary">头像和昵称仅保存在本机</text></view>
      <button class="button-secondary settings-edit" :disabled="loggingOut" @tap="editProfile">编辑</button>
    </view>
    <view v-else class="info-card settings-login">
      <text class="card-title">登录后管理资料和消息提醒</text>
      <text class="body-secondary">手机号用于确认身份，头像和昵称只保存在本机。</text>
      <button class="button-primary action-gap" @tap="openLogin">登录/注册</button>
    </view>
    <button v-if="authenticated" class="info-card settings-row" :disabled="loggingOut" @tap="notifications"><view><text class="shortcut-title">消息提醒</text><text class="body-secondary">选择报名和新活动提醒</text></view><text class="settings-arrow">›</text></button>
    <button class="info-card settings-row" @tap="privacy"><text class="shortcut-title">隐私保护指引</text><text class="settings-arrow">›</text></button>
    <button v-if="authenticated" class="info-card settings-row settings-logout" :disabled="loggingOut" @tap="logout"><text class="shortcut-title">{{ loggingOut ? '正在退出…' : '退出登录' }}</text><text class="settings-arrow">›</text></button>
    <ProfileLoginSheet v-if="profileSheetVisible" :require-phone="needsPhone" :title="needsPhone ? '确认登录身份' : '编辑资料'" @completed="completeProfile" @saved="savedProfile" @cancelled="closeSheet" />
  </view>
</template>

<style>
@import "../../styles/discovery.css";
.settings-page { max-width: 760px; margin: 0 auto; }
.settings-profile { display: flex; align-items: center; gap: var(--space-3); }
.settings-avatar { flex: 0 0 auto; width: var(--size-profile-avatar); height: var(--size-profile-avatar); border-radius: 50%; background: var(--brand-mist); }
.settings-avatar-placeholder { display: flex; align-items: center; justify-content: center; }
.settings-profile-copy { flex: 1; min-width: 0; }
.settings-profile-copy .card-title { margin-top: 0; }
.settings-edit { flex: 0 0 auto; min-height: var(--size-touch-target); margin: 0; padding: 0 var(--space-3); line-height: var(--size-touch-target); }
.settings-row { display: flex; align-items: center; justify-content: space-between; width: 100%; text-align: left; }
.settings-row::after { border: 0; }
.settings-row .shortcut-title { display: block; color: var(--text-primary); font-size: var(--font-body); }
.settings-arrow { color: var(--text-secondary); font-size: var(--font-h2); }
</style>
