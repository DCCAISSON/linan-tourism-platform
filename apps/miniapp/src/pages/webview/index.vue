<script setup lang="ts">
import { ref } from "vue"
import { onLoad } from "@dcloudio/uni-app"

const sourceUrl = ref("")

onLoad((query) => {
  const value = query?.["url"] ?? ""
  if (value.startsWith("https://")) sourceUrl.value = value
})
</script>

<template>
  <web-view v-if="sourceUrl" :src="sourceUrl" />
  <view v-else class="webview-error">活动影像链接无效，请返回后重试。</view>
</template>

<style>
.webview-error {
  padding: 48px 24px;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.7;
  text-align: center;
}
</style>
