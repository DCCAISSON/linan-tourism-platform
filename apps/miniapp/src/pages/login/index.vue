<script setup lang="ts">
import { onMounted, ref } from "vue"
import { ApiError, createMiniappApi } from "../../api"

const api = createMiniappApi()
const familyCode = ref("")
const loading = ref(true)
const binding = ref(false)
const message = ref("正在确认微信身份…")
const showBinding = ref(false)

onMounted(() => { void autoLogin() })

async function autoLogin(): Promise<void> {
  loading.value = true
  message.value = "正在确认微信身份…"
  try {
    const code = await requestWechatCode()
    await api.loginWithWechatCode(code)
    enterHome()
  } catch (cause) {
    if (cause instanceof ApiError && cause.statusCode === 401) {
      showBinding.value = true
      message.value = "首次使用请填写工作人员提供的家庭码。"
    } else {
      message.value = readableLoginError(cause)
    }
  } finally {
    loading.value = false
  }
}

async function bindFamily(): Promise<void> {
  const codeValue = familyCode.value.trim()
  if (codeValue.length === 0 || binding.value) {
    if (codeValue.length === 0) message.value = "请填写家庭码。"
    return
  }
  binding.value = true
  message.value = "正在绑定家庭…"
  try {
    const loginCode = await requestWechatCode()
    await api.bindWechatCode(loginCode, codeValue)
    enterHome()
  } catch (cause) {
    message.value = readableLoginError(cause)
  } finally {
    binding.value = false
  }
}

function requestWechatCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.login({
      provider: "weixin",
      success: (result) => {
        if (typeof result.code === "string" && result.code.length > 0) resolve(result.code)
        else reject(new Error("微信登录未返回有效凭证"))
      },
      fail: reject,
    })
  })
}

function enterHome(): void {
  uni.switchTab({ url: "/pages/index/index" })
}

function readableLoginError(cause: unknown): string {
  if (cause instanceof ApiError) {
    if (cause.statusCode === 401) return "家庭码无效或已绑定其他微信，请联系工作人员核对。"
    if (cause.statusCode === 400 || cause.statusCode === 503) return "小程序登录服务尚未配置完成，请稍后再试。"
    return cause.message
  }
  return "微信登录失败，请检查网络后重试。"
}
</script>

<template>
  <view class="login-page">
    <view class="login-brand">
      <text class="login-eyebrow">临安旅游集散中心</text>
      <text class="login-title">临安旅游通</text>
      <text class="login-lead">研学活动报名、订单、行前服务与家庭信息统一入口</text>
    </view>

    <view class="login-card">
      <text class="login-card__title">微信身份确认</text>
      <text class="login-message">{{ message }}</text>

      <view v-if="showBinding" class="binding-form">
        <label class="binding-label" for="family-code">家庭码</label>
        <input
          id="family-code"
          v-model="familyCode"
          class="binding-input"
          maxlength="64"
          placeholder="请输入工作人员提供的家庭码"
          confirm-type="done"
          @confirm="bindFamily"
        />
        <button class="button-primary binding-button" :disabled="binding" @tap="bindFamily">
          {{ binding ? "绑定中…" : "确认并进入" }}
        </button>
      </view>

      <button v-else-if="!loading" class="button-secondary retry-button" @tap="autoLogin">重新登录</button>
      <text class="login-note">家庭码只用于确认报名家庭，不会替代微信支付授权。</text>
    </view>
  </view>
</template>

<style>
@import "../../styles/discovery.css";
.login-page { box-sizing: border-box; min-height: 100dvh; padding: var(--space-6) var(--space-4) calc(var(--space-8) + env(safe-area-inset-bottom)); background: var(--surface-primary); }
.login-brand { padding: var(--space-8) var(--space-5); border-radius: var(--radius-banner); background: var(--brand-ink); }
.login-eyebrow, .login-title, .login-lead { display: block; }
.login-eyebrow { color: #dff1f6; font-size: var(--font-body-sm); letter-spacing: 2px; }
.login-title { margin-top: var(--space-3); color: var(--on-accent); font-size: var(--font-display); font-weight: 700; line-height: 1.2; }
.login-lead { margin-top: var(--space-3); color: #eef7fa; font-size: var(--font-body); line-height: 1.7; }
.login-card { margin-top: var(--space-5); padding: var(--space-5); border-radius: var(--radius-card); background: var(--surface-elevated); }
.login-card__title { display: block; color: var(--text-primary); font-size: var(--font-h3); font-weight: 600; }
.login-message { display: block; min-height: 44px; margin-top: var(--space-3); color: var(--text-secondary); font-size: var(--font-body-sm); line-height: 1.6; }
.binding-form { margin-top: var(--space-4); }
.binding-label { display: block; color: var(--text-primary); font-size: var(--font-body-sm); font-weight: 600; }
.binding-input { box-sizing: border-box; width: 100%; min-height: var(--size-touch-target); margin-top: var(--space-2); padding: 0 var(--space-3); border: 1px solid var(--border-default); border-radius: var(--radius-control); color: var(--text-primary); background: var(--surface-primary); font-size: var(--font-body); }
.binding-input:focus { border-color: var(--accent-primary); }
.binding-button { margin-top: var(--space-4); }
.login-note { display: block; margin-top: var(--space-5); color: var(--text-tertiary); font-size: var(--font-caption); line-height: 1.6; }
@media (min-width: 768px) { .login-page { max-width: 760px; margin: 0 auto; padding: var(--space-8); } }
</style>
