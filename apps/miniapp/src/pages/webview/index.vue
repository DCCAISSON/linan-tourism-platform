<script setup lang="ts">
import { ref } from "vue"
import { onHide, onLoad, onShow } from "@dcloudio/uni-app"
import { createAlbumApi } from "../../album-api"

const sourceUrl = ref("")
const orderId = ref("")
const providerKind = ref("")
const message = ref("正在准备活动影像…")
let readVersion = 0

onLoad((query) => {
  orderId.value = query?.["orderId"] ?? ""
  providerKind.value = query?.["kind"] ?? ""
})
onShow(async () => {
  const currentRead = ++readVersion
  sourceUrl.value = ""
  message.value = "正在准备活动影像…"
  if (!orderId.value || !["album", "live"].includes(providerKind.value)) { message.value = "活动影像暂时无法打开，请返回订单后重试。"; return }
  try {
    const album = await createAlbumApi().getOrderAlbum(orderId.value)
    if (currentRead !== readVersion) return
    const provider = album.providers.find(item => item.kind === providerKind.value)
    sourceUrl.value = provider?.url ?? ""
    if (!provider) message.value = "活动影像暂未开放，请返回订单查看其他信息。"
  } catch (cause) {
    if (currentRead !== readVersion) return
    sourceUrl.value = ""
    message.value = cause instanceof Error ? cause.message : "相册访问失败，请返回订单后重试。"
  }
})
onHide(() => { ++readVersion; sourceUrl.value = "" })
</script>

<template>
  <web-view v-if="sourceUrl" :src="sourceUrl" />
  <view v-else class="webview-error">{{ message }}</view>
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
