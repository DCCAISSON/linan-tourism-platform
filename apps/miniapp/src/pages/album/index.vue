<script setup lang="ts">
import { computed, nextTick, ref } from "vue"
import { onLoad } from "@dcloudio/uni-app"
import { createAlbumApi, type AlbumCollection, type AlbumProvider } from "../../album-api"
import DiscoveryState from "../../components/DiscoveryState.vue"
import { formatDateLabel, type LoadState } from "../../enrollment-flow"
import { readableError } from "../index/page-helpers"

const api = createAlbumApi()
const orderId = ref("")
const album = ref<AlbumCollection>({ assets: [], providers: [] })
const state = ref<LoadState>("loading")
const error = ref("")

const albumProviders = computed(() => album.value.providers.filter((provider) => provider.kind === "album"))
const liveProviders = computed(() => album.value.providers.filter((provider) => provider.kind === "live"))
const hasMedia = computed(() => album.value.assets.length > 0)

onLoad((query) => {
  orderId.value = query?.["orderId"] ?? ""
  void load()
})

async function load(): Promise<void> {
  state.value = "loading"
  error.value = ""
  await nextTick()
  uni.pageScrollTo({ scrollTop: 0, duration: 0 })
  try {
    album.value = await api.getOrderAlbum(orderId.value)
    state.value = "ready"
  } catch (cause) {
    state.value = "error"
    error.value = readableError(cause, "相册加载失败，请重试")
  }
}

function openProvider(provider: AlbumProvider): void {
  uni.navigateTo({ url: `/pages/webview/index?orderId=${encodeURIComponent(orderId.value)}&kind=${provider.kind}` })
}
</script>

<template>
  <view class="discovery-page album-page">
    <text class="page-heading">活动相册</text>
    <DiscoveryState :state="state" :message="error" @retry="load" />
    <view v-if="state === 'ready'">
      <view class="info-card album-card">
        <text class="card-title">图片直播入口</text>
        <text v-if="albumProviders.length === 0" class="body-secondary">图片直播入口尚未配置，活动后开放时会在这里显示。</text>
        <button v-for="provider in albumProviders" :key="provider.kind" class="button-secondary action-gap" @tap="openProvider(provider)">打开{{ provider.label }}</button>
      </view>
      <view class="info-card album-card">
        <text class="card-title">视频直播入口</text>
        <text v-if="liveProviders.length === 0" class="body-secondary">直播入口尚未配置或未购买服务。</text>
        <button v-for="provider in liveProviders" :key="provider.kind" class="button-secondary action-gap" @tap="openProvider(provider)">打开{{ provider.label }}</button>
      </view>
      <view v-if="!hasMedia" class="info-card album-card">
        <text class="body-secondary">管理员尚未发布照片或视频。</text>
      </view>
      <view v-for="asset in album.assets" :key="asset.id" class="info-card album-asset">
        <text class="card-title">{{ asset.title }}</text>
        <text class="detail-line">发布时间：{{ formatDateLabel(asset.createdAt) }}</text>
        <image v-if="asset.kind === 'image'" class="album-media" :src="asset.contentUrl" mode="aspectFill" />
        <video v-else class="album-media" :src="asset.contentUrl" controls />
      </view>
    </view>
  </view>
</template>

<style>
@import "../../styles/discovery.css";
.album-card,
.album-asset {
  gap: 10px;
}
.album-media {
  width: 100%;
  min-height: 220px;
  border-radius: 12px;
  background: var(--surface-muted);
  overflow: hidden;
}
</style>
