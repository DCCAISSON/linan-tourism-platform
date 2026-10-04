<script setup lang="ts">
import { ref } from "vue"
import { onLoad } from "@dcloudio/uni-app"
import type { WechatLoginResponse } from "../../api"
import ProfileLoginSheet from "../../components/ProfileLoginSheet.vue"

const returnTo = ref("/pages/index/index")
const sheetVisible = ref(false)

onLoad((query) => {
  if (getCurrentPages().length === 1) { browse(); return }
  const target = query?.["returnTo"]
  for (const route of ["/pages/orders/index", "/pages/family/index", "/pages/notifications/index", "/pages/settings/index"]) {
    if (target === route || target === encodeURIComponent(route)) { returnTo.value = route; sheetVisible.value = true; return }
  }
  browse()
})

function browse(): void { uni.switchTab({ url: "/pages/index/index" }) }
function continueAfterLogin(): void {
  if (returnTo.value === "/pages/notifications/index" || returnTo.value === "/pages/settings/index") uni.redirectTo({ url: returnTo.value })
  else uni.switchTab({ url: returnTo.value })
}
function completeLogin(_response: WechatLoginResponse, _phone?: string): void { sheetVisible.value = false; continueAfterLogin() }
function cancelLogin(): void { sheetVisible.value = false; continueAfterLogin() }
</script>

<template>
  <view class="discovery-page">
    <ProfileLoginSheet v-if="sheetVisible" @completed="completeLogin" @cancelled="cancelLogin" />
  </view>
</template>

<style>
@import "../../styles/discovery.css";
</style>
