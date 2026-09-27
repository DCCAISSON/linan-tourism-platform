<script setup lang="ts">
import { ref } from "vue"
import { onLoad } from "@dcloudio/uni-app"
import WechatConsent from "../../components/WechatConsent.vue"
const returnTo = ref("/pages/index/index")
const hasProtectedTarget = ref(false)
onLoad((query) => {
  const target = query?.["returnTo"]
  for (const route of ["/pages/orders/index", "/pages/family/index"]) {
    if (target === route || target === encodeURIComponent(route)) { returnTo.value = route; hasProtectedTarget.value = true }
  }
  if (!hasProtectedTarget.value) browse()
})
function browse(): void { uni.switchTab({ url: "/pages/index/index" }) }
function continueAfterLogin(): void { uni.switchTab({ url: returnTo.value }) }
</script>
<template>
  <view v-if="hasProtectedTarget" class="discovery-page login-page">
    <text class="page-heading">欢迎来到临安旅游通</text>
    <text class="page-subtitle">山水之间，安排好一家人的研学出行。</text>
    <WechatConsent title="登录，继续您的行程" @authenticated="continueAfterLogin" />
    <button class="button-secondary action-gap" @tap="browse">先逛逛研学活动</button>
  </view>
</template>
<style>
@import "../../styles/discovery.css";
.login-page { padding-top: var(--space-8); }
.login-page .page-heading { font-size: var(--font-h2); }
</style>
