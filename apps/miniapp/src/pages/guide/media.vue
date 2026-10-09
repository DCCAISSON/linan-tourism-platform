<script setup lang="ts">
import { computed, ref } from "vue"
import { onHide, onLoad, onShow, onUnload } from "@dcloudio/uni-app"
import { createStaffApi } from "../../staff-api"
import { getStaffSessionToken } from "../../staff-session"
import { createGuideMediaApi, mediaStatusLabels } from "../../guide-media-api"
import { useGuideMedia } from "../../guide-media-state"

const sessionId = ref("")
const deleting = ref("")
const { state, load, hide, clear, choose, upload, change, preview } = useGuideMedia({ api: createGuideMediaApi(), me: createStaffApi().me, token: getStaffSessionToken, login: () => { uni.redirectTo({ url: "/pages/guide/index" }) } })
const busy = computed(() => state.loading || state.saving || state.picking || state.previewing)
onLoad(query => { sessionId.value = typeof query?.["id"] === "string" ? query["id"] : "" })
onShow(() => { void load(sessionId.value) })
onHide(() => { deleting.value = ""; hide() })
onUnload(clear)
function back(): void {
  uni.navigateBack({ fail: () => { uni.redirectTo({ url: `/pages/guide/session?id=${encodeURIComponent(sessionId.value)}` }) } })
}
</script>

<template>
  <view class="guide-page">
    <view class="guide-header"><text class="guide-title">活动照片与视频</text><button class="guide-secondary" @tap="back">返回团期</button></view>
    <view v-if="state.loading" class="guide-section" role="status">正在读取团期与素材…</view>
    <view v-if="state.error" class="guide-section" role="alert"><text class="guide-error">{{ state.error }}</text><button class="guide-secondary" :disabled="busy" @tap="load(sessionId)">刷新素材</button></view>
    <text v-if="state.notice" class="guide-success" role="status">{{ state.notice }}</text>
    <template v-if="state.session">
      <view class="guide-section"><text class="guide-subtitle">{{ state.session.code }}</text><text class="guide-muted">上传后先保存为草稿，发布后本团家长才可查看。</text><button class="guide-secondary" :disabled="busy" @tap="load(sessionId)">刷新素材</button></view>
      <view v-if="state.permissions.includes('media.upload')" class="guide-section">
        <text class="guide-subtitle">上传照片或视频</text>
        <label class="guide-field"><text>素材标题</text><input v-model="state.title" maxlength="120" :disabled="busy" placeholder="如：参观博物馆" /></label>
        <text class="guide-muted">图片：PNG、JPEG、WebP，不超过10MB；视频：MP4、WebM，不超过50MB。</text>
        <view class="guide-actions"><button class="guide-secondary" :disabled="busy" @tap="choose('image')">选择照片</button><button class="guide-secondary" :disabled="busy" @tap="choose('video')">选择视频</button></view>
        <text v-if="state.picking" class="guide-muted" role="status">正在选择文件…</text>
        <text v-if="state.file" class="guide-muted">已选择{{ state.file.kind === 'image' ? '照片' : '视频' }} · {{ Math.ceil(state.file.size / 1024) }}KB</text>
        <button class="guide-primary" :disabled="busy || !state.file || !state.title.trim()" @tap="upload">{{ state.saving ? '正在保存…' : state.uploadFailed ? '重试上传草稿' : '上传为草稿' }}</button>
      </view>
      <view v-else class="guide-section"><text class="guide-muted">当前账号无上传权限，可查看已分配团期的素材。</text></view>
      <view v-if="state.previewing" class="guide-section" role="status">正在打开素材…</view>
      <view v-if="state.preview" class="guide-section">
        <text class="guide-subtitle">{{ state.preview.title }}</text>
        <image v-if="state.preview.kind === 'image'" class="guide-media-preview" :src="state.preview.path" mode="aspectFit" :aria-label="state.preview.title" />
        <video v-else class="guide-media-preview" :src="state.preview.path" controls :autoplay="false" />
        <button class="guide-secondary" @tap="state.preview = null">关闭预览</button>
      </view>
      <view class="guide-section">
        <text class="guide-subtitle">本团素材 · {{ state.assets.length }}</text>
        <text v-if="!state.assets.length" class="guide-muted">暂无照片或视频。</text>
        <view v-for="asset in state.assets" :key="asset.id" class="guide-row">
          <text class="guide-person-name">{{ asset.title }}</text>
          <text class="guide-muted">{{ asset.kind === 'image' ? '照片' : '视频' }} · {{ mediaStatusLabels[asset.status] }} · {{ Math.ceil(asset.byteSize / 1024) }}KB</text>
          <text v-if="asset.cleanupPending" class="guide-warning">文件清理尚未完成，请联系工作人员处理。</text>
          <text v-if="asset.status === 'failed'" class="guide-muted">该次上传未成功，可重新选择文件上传。</text>
          <view class="guide-actions">
            <button v-if="asset.status === 'draft' || asset.status === 'published'" class="guide-secondary" :disabled="busy" @tap="preview(asset)">查看</button>
            <button v-if="asset.status === 'draft' && state.permissions.includes('media.publish')" class="guide-primary" :disabled="busy" @tap="change(asset, 'published')">发布给本团家长</button>
            <button v-if="asset.status === 'published' && state.permissions.includes('media.publish')" class="guide-secondary" :disabled="busy" @tap="change(asset, 'draft')">下架</button>
            <button v-if="(asset.status === 'draft' || asset.status === 'failed') && state.permissions.includes('media.delete')" class="guide-secondary" :disabled="busy" @tap="deleting = asset.id">删除</button>
          </view>
          <text v-if="asset.status === 'draft' && !state.permissions.includes('media.publish')" class="guide-muted">发布需由有发布权限的工作人员操作。</text>
          <view v-if="deleting === asset.id" class="guide-form"><text>确认删除“{{ asset.title }}”？删除后无法恢复。</text><view class="guide-actions"><button class="guide-secondary" :disabled="busy" @tap="deleting = ''">取消</button><button class="guide-secondary" :disabled="busy" @tap="change(asset, 'delete'); deleting = ''">确认删除</button></view></view>
        </view>
      </view>
    </template>
  </view>
</template>

<style>
@import "../../guide-execution.css";
.guide-media-preview { width: 100%; height: calc(var(--space-10) * 3); }
</style>
