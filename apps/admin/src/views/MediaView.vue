<template>
  <section class="media-page" aria-labelledby="media-title">
    <header class="media-heading">
      <div>
        <p class="media-heading__eyebrow">团相册与视频</p>
        <h2 id="media-title">素材上传、发布和直播入口</h2>
      </div>
      <p>素材保存在受控存储中；图片直播或外部相册未配置时不会显示为已接通。</p>
    </header>

    <form class="media-panel media-form" @submit.prevent="loadCollection">
      <fieldset :disabled="loadingSessions || loadingCollection || uploading">
        <legend>选择团期</legend>
        <label>团期
          <select v-model="sessionId" required>
            <option value="">{{ loadingSessions ? "团期加载中..." : "请选择团期" }}</option>
            <option v-for="session in sessions" :key="session.id" :value="session.id">{{ session.code }}</option>
          </select>
        </label>
        <button type="submit" :disabled="sessionId === ''">{{ loadingCollection ? "读取中..." : "读取素材" }}</button>
      </fieldset>
      <p v-if="message" class="media-state">{{ message }}</p>
      <p v-if="error" class="media-state media-state--error" role="alert">{{ error }}</p>
    </form>

    <form class="media-panel media-form" @submit.prevent="uploadSelected">
      <fieldset :disabled="sessionId === '' || uploading">
        <legend>上传图片或视频</legend>
        <label>标题<input v-model="title" maxlength="120" required /></label>
        <label>文件<input type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm" required @change="chooseFile" /></label>
        <button type="submit" :disabled="selectedFile === null">{{ uploading ? "上传中..." : "上传素材" }}</button>
      </fieldset>
    </form>

    <section class="media-panel" aria-labelledby="media-provider-title">
      <h3 id="media-provider-title">第三方相册/直播入口</h3>
      <div class="media-provider-grid">
        <form v-for="provider in providerForms" :key="provider.kind" class="media-provider" @submit.prevent="saveProvider(provider.kind)">
          <label>类型<input :value="provider.kind === 'album' ? '图片直播 / 外部相册' : '视频直播'" disabled /></label>
          <label>名称<input v-model="provider.label" maxlength="80" :required="provider.enabled" :disabled="loadingCollection || savingProvider" /></label>
          <label>HTTPS入口<input v-model="provider.url" maxlength="2000" :required="provider.enabled" :disabled="loadingCollection || savingProvider" placeholder="https://..." /></label>
          <label class="media-checkbox"><input v-model="provider.enabled" type="checkbox" :disabled="loadingCollection || savingProvider" /> 启用</label>
          <button type="submit" :disabled="sessionId === '' || loadingCollection || savingProvider">{{ savingProvider ? "保存中..." : "保存入口" }}</button>
          <p v-if="!provider.enabled" class="media-empty">未配置或未购买服务时，家庭端显示空态。</p>
        </form>
      </div>
    </section>

    <section class="media-panel" aria-labelledby="media-assets-title">
      <h3 id="media-assets-title">素材列表</h3>
      <p v-if="assets.length === 0" class="media-empty">暂无素材。授权工作人员或已分配导游可上传，发布后家庭端才可查看。</p>
      <ul class="media-asset-list">
        <li v-for="asset in assets" :key="asset.id" class="media-asset">
          <div>
            <strong>{{ asset.title }}</strong>
            <span>{{ asset.kind === "image" ? "图片" : "视频" }} · {{ statusText(asset.status) }} · {{ Math.ceil(asset.byteSize / 1024) }}KB</span>
            <span v-if="asset.cleanupPending">文件清理待确认</span>
          </div>
          <a v-if="asset.status === 'draft' || asset.status === 'published'" :href="mediaContentUrl(sessionId, asset.id)" target="_blank" rel="noreferrer">查看</a>
          <button v-if="asset.status === 'draft'" type="button" @click="setStatus(asset, 'published')">发布</button>
          <button v-if="asset.status === 'published'" type="button" @click="setStatus(asset, 'draft')">下架</button>
          <button type="button" :disabled="asset.status === 'published'" @click="removeAsset(asset)">删除</button>
        </li>
      </ul>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue"
import { deleteMediaAsset, getMediaCollection, listMediaSessions, mediaContentUrl, readableMediaError, saveMediaProvider, updateMediaStatus, uploadMediaAsset } from "@/api/media"
import type { MediaAsset, MediaCollection, MediaProvider, MediaSession } from "@/api/media"

type ProviderForm = { readonly kind: "album" | "live"; label: string; url: string; enabled: boolean; version: number }

const sessions = ref<readonly MediaSession[]>([])
const sessionId = ref("")
const collection = ref<MediaCollection>({ assets: [], providers: [] })
const title = ref("")
const selectedFile = ref<File | null>(null)
const loadingSessions = ref(false)
const loadingCollection = ref(false)
const uploading = ref(false)
const savingProvider = ref(false)
const error = ref("")
const message = ref("")
const assets = computed(() => collection.value.assets)
const providerForms = reactive<ProviderForm[]>([
  { kind: "album", label: "", url: "", enabled: false, version: 0 },
  { kind: "live", label: "", url: "", enabled: false, version: 0 },
])

onMounted(async () => {
  loadingSessions.value = true
  try { sessions.value = await listMediaSessions() }
  catch (caught) { error.value = readableMediaError(caught) }
  finally { loadingSessions.value = false }
})

async function loadCollection(): Promise<void> {
  if (sessionId.value === "") return
  loadingCollection.value = true
  error.value = ""
  message.value = ""
  try {
    collection.value = await getMediaCollection(sessionId.value)
    applyProviders(collection.value.providers)
  } catch (caught) { error.value = readableMediaError(caught) }
  finally { loadingCollection.value = false }
}

function chooseFile(event: Event): void {
  const files = event.target instanceof HTMLInputElement ? event.target.files : null
  selectedFile.value = files?.[0] ?? null
}

async function uploadSelected(): Promise<void> {
  if (sessionId.value === "" || selectedFile.value === null) return
  uploading.value = true
  error.value = ""
  try {
    await uploadMediaAsset(sessionId.value, { file: selectedFile.value, title: title.value, requestId: crypto.randomUUID() })
    title.value = ""
    selectedFile.value = null
    message.value = "上传成功，发布后家庭端可查看。"
    await loadCollection()
  } catch (caught) {
    const uploadError = readableMediaError(caught)
    await loadCollection()
    error.value = error.value ? `${uploadError}；${error.value}` : uploadError
  }
  finally { uploading.value = false }
}

async function setStatus(asset: MediaAsset, status: "draft" | "published"): Promise<void> {
  try {
    await updateMediaStatus(sessionId.value, asset, status)
    await loadCollection()
  } catch (caught) { error.value = readableMediaError(caught) }
}

async function removeAsset(asset: MediaAsset): Promise<void> {
  try {
    await deleteMediaAsset(sessionId.value, asset)
    await loadCollection()
  } catch (caught) { error.value = readableMediaError(caught) }
}

async function saveProvider(kind: "album" | "live"): Promise<void> {
  const provider = providerForms.find(item => item.kind === kind)
  if (provider === undefined || sessionId.value === "" || loadingCollection.value || savingProvider.value) return
  savingProvider.value = true
  error.value = ""
  try {
    const saved = await saveMediaProvider(sessionId.value, { kind, label: provider.label, url: provider.url, enabled: provider.enabled, expectedVersion: provider.version })
    Object.assign(provider, saved)
    message.value = provider.enabled ? "入口已保存。" : "入口已关闭，家庭端显示空态。"
  } catch (caught) { error.value = readableMediaError(caught) }
  finally { savingProvider.value = false }
}

function applyProviders(providers: readonly MediaProvider[]): void {
  for (const form of providerForms) {
    const provider = providers.find(item => item.kind === form.kind)
    Object.assign(form, provider ?? { label: "", url: "", enabled: false, version: 0 })
  }
}

function statusText(status: MediaAsset["status"]): string {
  return { uploading: "上传中", draft: "未发布", published: "已发布", failed: "上传失败" }[status]
}
</script>

<style scoped>
.media-page { max-width: 1180px; margin: 0 auto; padding: 24px; color: var(--text-primary); }
.media-heading { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
.media-heading__eyebrow { margin: 0 0 4px; color: var(--accent-primary); font-size: 14px; }
.media-heading h2 { margin: 0; font-size: 28px; line-height: 1.25; }
.media-heading p { max-width: 480px; margin: 0; color: var(--text-secondary); line-height: 1.6; }
.media-panel { margin-top: 16px; padding: 20px; border: 1px solid var(--border-default); border-radius: 8px; background: var(--surface-elevated); }
.media-form fieldset, .media-provider { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; align-items: end; padding: 0; border: 0; }
.media-form fieldset, .media-form label { min-width: 0; }
.media-form select { width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; }
.media-form legend { grid-column: 1 / -1; font-weight: 600; }
.media-form label, .media-provider label { display: grid; gap: 6px; color: var(--text-secondary); font-size: 14px; }
.media-form input, .media-form select, .media-provider input { min-height: 40px; border: 1px solid var(--border-default); border-radius: 6px; padding: 0 10px; color: var(--text-primary); background: var(--surface-primary); }
.media-form button, .media-provider button, .media-asset button, .media-asset a { min-height: 40px; border: 0; border-radius: 6px; padding: 0 12px; color: var(--on-accent); background: var(--accent-primary); text-decoration: none; line-height: 40px; }
.media-asset button:disabled { color: var(--text-secondary); background: var(--surface-secondary); }
.media-provider-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.media-provider { grid-template-columns: 1fr; }
.media-checkbox { display: flex !important; grid-template-columns: auto 1fr !important; align-items: center; }
.media-checkbox input { min-height: auto; }
.media-state { margin: 12px 0 0; color: var(--text-secondary); }
.media-state--error { color: var(--status-error); }
.media-empty { color: var(--text-secondary); line-height: 1.6; }
.media-asset-list { display: grid; gap: 12px; padding: 0; list-style: none; }
.media-asset { display: grid; grid-template-columns: minmax(0, 1fr) repeat(4, auto); gap: 10px; align-items: center; padding: 12px; border: 1px solid var(--border-subtle); border-radius: 8px; }
.media-asset strong, .media-asset span { display: block; overflow-wrap: anywhere; }
.media-asset span { margin-top: 4px; color: var(--text-secondary); font-size: 14px; }
@media (max-width: 768px) {
  .media-page { padding: 16px; }
  .media-heading, .media-form fieldset, .media-provider-grid, .media-asset { grid-template-columns: 1fr; display: grid; }
}
</style>
