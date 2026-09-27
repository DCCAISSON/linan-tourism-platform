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
<template><view v-if="hasProtectedTarget" class="discovery-page"><text class="page-heading">临安旅游通</text><WechatConsent @authenticated="continueAfterLogin" /><button class="button-secondary action-gap" @tap="browse">返回首页浏览</button></view></template>
<style>@import "../../styles/discovery.css";</style>
