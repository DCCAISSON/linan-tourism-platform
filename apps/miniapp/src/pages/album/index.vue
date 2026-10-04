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
    <text class="page-subtitle">这里展示已发布的活动影像和可打开的影像内容。</text>
    <DiscoveryState :state="state" :message="error" @retry="load" />
    <view v-if="state === 'ready'">
      <text class="section-heading">活动影像</text>
      <view v-if="!hasMedia" class="info-card album-empty">
        <text class="card-title">暂未发布照片或视频</text>
        <text class="body-secondary">活动影像发布后会显示在这里。</text>
      </view>
      <view v-for="asset in album.assets" :key="asset.id" class="info-card album-asset">
        <text class="card-title">{{ asset.title }}</text>
        <text class="detail-line">发布时间：{{ formatDateLabel(asset.createdAt) }}</text>
        <image v-if="asset.kind === 'image'" class="album-media" :src="asset.contentUrl" mode="aspectFill" />
        <video v-else class="album-media" :src="asset.contentUrl" controls />
      </view>
      <text class="section-heading">外部影像入口</text>
      <view class="info-card album-card">
        <text class="card-title">图片直播</text>
        <text v-if="albumProviders.length === 0" class="body-secondary">图片直播暂未开放，开放后会显示在这里。</text>
        <button v-for="provider in albumProviders" :key="provider.kind" class="button-secondary action-gap" @tap="openProvider(provider)">打开{{ provider.label }}</button>
      </view>
      <view class="info-card album-card">
        <text class="card-title">视频直播</text>
        <text v-if="liveProviders.length === 0" class="body-secondary">视频直播暂未开放。</text>
        <button v-for="provider in liveProviders" :key="provider.kind" class="button-secondary action-gap" @tap="openProvider(provider)">打开{{ provider.label }}</button>
      </view>
    </view>
  </view>
</template>

<style>
@import "../../styles/discovery.css";
.album-page { max-width: 760px; margin: 0 auto; }
.album-card, .album-asset, .album-empty { display: flex; flex-direction: column; gap: var(--space-2); }
.album-media {
  width: 100%;
  min-height: 220px;
  border-radius: var(--radius-card);
  background: var(--surface-secondary);
  overflow: hidden;
}
@media (min-width: 768px) { .album-media { min-height: 360px; } }
</style>
