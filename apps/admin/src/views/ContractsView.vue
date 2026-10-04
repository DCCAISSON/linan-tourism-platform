<template>
  <section class="orders-page contracts-page" aria-labelledby="contracts-title">
    <header class="orders-card orders-heading"><div><h2 id="contracts-title">团期合同</h2><p>按团期核对范本，保存新版本后再启用。换版只用于后续报名，已有订单保留当时的合同。</p></div></header>
    <section class="orders-card" aria-label="选择团期">
      <p v-if="initialLoading" role="status">正在加载团期和范本...</p>
      <p v-if="initialError" class="orders-error" role="alert">{{ initialError }} <button type="button" @click="initialize">重试</button></p>
      <form class="orders-filters" @submit.prevent="loadSession">
        <label class="orders-field contract-session-field">团期<select v-model="sessionId" :disabled="initialLoading || busy || loading"><option value="">请选择团期</option><option v-for="session in sessions" :key="session.id" :value="session.id">{{ schoolNames.get(session.organizationId) ?? '学校名称暂缺' }} · {{ activityNames.get(session.catalogItemId) ?? '活动名称暂缺' }} · {{ formatDate(session.startsAt) }} · {{ session.code }}</option></select></label>
        <button class="orders-button" type="submit" :disabled="!sessionId || initialLoading || loading || busy">{{ loading ? '读取中...' : '读取合同' }}</button>
      </form>
      <div v-if="selectedSession" class="contract-session-summary" aria-live="polite">
        <p class="orders-eyebrow">已选团期</p>
        <h3>{{ schoolNames.get(selectedSession.organizationId) ?? '学校名称暂缺' }} · {{ activityNames.get(selectedSession.catalogItemId) ?? '活动名称暂缺' }}</h3>
        <p>{{ formatDate(selectedSession.startsAt) }} 至 {{ formatDate(selectedSession.endsAt) }}（北京时间）</p>
        <p>团期编码：{{ selectedSession.code }}</p>
      </div>
      <p v-if="!initialLoading && !initialError && !sessions.length" class="orders-state">暂无可管理的团期。</p>
      <p v-if="loadError" class="orders-error" role="alert">{{ loadError }} <button type="button" @click="loadSession">重试</button></p>
    </section>
    <template v-if="config && loadedSessionId === sessionId">
      <section class="orders-card" aria-labelledby="contract-history-title">
        <div class="orders-section-heading contract-history-heading"><h3 id="contract-history-title">合同版本</h3><span>{{ activeVersion ? `当前启用：${activeVersion.version}` : '尚未启用' }}</span></div>
        <p v-if="config.versions.length === 0" class="orders-state">本团期尚未保存合同版本。请导入范本并核对正文。</p>
        <div v-for="item in featuredVersions" :key="item.id" class="contract-version">
          <div><span class="orders-status" :class="{ 'orders-status--paid': item.id === config.activeTemplateId }">{{ item.id === config.activeTemplateId ? '当前启用' : '最新保存 · 未启用' }}</span><h4>{{ item.title }}</h4><p>版本 {{ item.version }} · {{ formatDate(item.createdAt) }}</p></div>
          <div class="orders-refund-actions"><button type="button" class="orders-link" @click="openPreview(item)">查看全文</button><button v-if="canWrite && item.id !== config.activeTemplateId" type="button" class="orders-button orders-button--secondary" :disabled="busy" @click="activate(item.id)">启用此版本</button></div>
        </div>
        <button v-if="canWrite && config.activeTemplateId" class="orders-link" type="button" :disabled="busy" @click="activate(null)">停止后续报名使用合同</button>
        <p v-if="actionError" class="orders-error" role="alert">{{ actionError }}</p><p v-if="message" class="orders-state" role="status">{{ message }}</p>
      </section>
      <section v-if="canWrite" class="orders-card" aria-labelledby="contract-editor-title">
        <h3 id="contract-editor-title">保存新版本</h3>
        <p class="contract-hint">请核对本团期适用条款，以及费用、行程、服务、保险和违约约定，补全范本中的空白后保存。</p>
        <form class="contract-form" @submit.prevent="saveVersion">
          <div class="orders-filters"><label class="orders-field">原件范本<select v-model="sourceId" :disabled="busy" @change="clearDraft"><option value="">请选择范本</option><option v-for="source in sources" :key="source.id" :value="source.id">{{ source.title }}</option></select></label><button class="orders-button orders-button--secondary" type="button" :disabled="!sourceId || busy" @click="importSource">导入范本全文</button></div>
          <p v-if="selectedSource?.kind === 'staff_recuperation'" class="contract-hint">个人签字仅作阅读确认，单位和旅行社签章另行办理。</p>
          <template v-if="importedSourceId">
            <p class="contract-hint">原件：{{ selectedSource?.sourceFilename }}。下方正文可编辑或粘贴本团期核对后的内容。</p>
            <label class="orders-field">合同标题<input v-model="title" required maxlength="200" :disabled="busy" /></label>
            <label class="orders-field">版本名称<input v-model="version" required maxlength="64" placeholder="例如：2026-10-03 第1版" :disabled="busy" /></label>
            <label class="orders-field">合同全文<textarea v-model="bodyText" required maxlength="150000" rows="20" :disabled="busy" /></label>
            <label class="contract-review"><input v-model="reviewed" type="checkbox" :disabled="busy" />我已核对本团期适用条款并补全正文</label>
            <button type="submit" class="orders-button" :disabled="busy || !reviewed || !title.trim() || !version.trim() || !bodyText.trim()">{{ busy ? '处理中...' : '保存新版本' }}</button>
          </template>
          <p v-if="saveError" class="orders-error" role="alert">{{ saveError }}</p>
        </form>
      </section>
      <details v-if="historyVersions.length" class="orders-card contract-history">
        <summary>其他历史版本（{{ historyVersions.length }}）<span>展开查看或启用旧版本；已有订单的合同不变</span></summary>
        <div v-for="item in historyVersions" :key="item.id" class="contract-version">
          <div><strong>{{ item.title }}</strong><p>版本 {{ item.version }} · {{ formatDate(item.createdAt) }}</p></div>
          <div class="orders-refund-actions"><button type="button" class="orders-link" @click="openPreview(item)">查看全文</button><button v-if="canWrite" type="button" class="orders-button orders-button--secondary" :disabled="busy" @click="activate(item.id)">启用此版本</button></div>
        </div>
      </details>
      <article v-if="preview" ref="previewPanel" class="orders-card contract-preview" aria-label="历史合同全文" tabindex="-1">
        <div class="orders-section-heading"><h3>{{ preview.title }} · {{ preview.version }}</h3><button type="button" class="orders-link" @click="preview = null">收起全文</button></div>
        <p>已保存版本只读；修改正文请另存新版本。</p><p>原件：{{ preview.sourceFilename }}</p><details><summary>原件及正文校验值</summary><p>原件 SHA-256：{{ preview.sourceSha256 }}</p><p>正文 SHA-256：{{ preview.bodySha256 }}</p></details>
        <pre class="contract-body">{{ preview.bodyText }}</pre>
      </article>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue"
import { getCurrentStaff } from "@/api/auth"
import { listCatalogItems, listSchools, listTourSessions, type CatalogItem, type School, type TourSession } from "@/api/configuration"
import { getSessionContracts, listContractSources, readableContractError, saveContractVersion, setActiveContract, type ContractSession, type ContractSource, type ContractTemplate } from "@/api/contracts"
import "@/styles/orders.css"

const sessions = ref<readonly TourSession[]>([])
const schools = ref<readonly School[]>([])
const activities = ref<readonly CatalogItem[]>([])
const sources = ref<readonly ContractSource[]>([])
const canWrite = ref(false)
const sessionId = ref("")
const loadedSessionId = ref("")
const config = ref<ContractSession | null>(null)
const preview = ref<ContractTemplate | null>(null)
const previewPanel = ref<HTMLElement | null>(null)
const initialLoading = ref(false)
const initialError = ref("")
const loading = ref(false)
const loadError = ref("")
const busy = ref(false)
const actionError = ref("")
const saveError = ref("")
const message = ref("")
const sourceId = ref("")
const importedSourceId = ref("")
const title = ref("")
const version = ref("")
const bodyText = ref("")
const reviewed = ref(false)
const selectedSource = computed(() => sources.value.find(source => source.id === sourceId.value))
const selectedSession = computed(() => sessions.value.find(session => session.id === sessionId.value))
const schoolNames = computed(() => new Map(schools.value.map(school => [school.id, school.name])))
const activityNames = computed(() => new Map(activities.value.map(activity => [activity.id, activity.title])))
const activeVersion = computed(() => config.value?.versions.find(item => item.id === config.value?.activeTemplateId))
const featuredVersions = computed(() => {
  const latest = config.value?.versions[0]
  return activeVersion.value ? [activeVersion.value, ...(latest && latest.id !== activeVersion.value.id ? [latest] : [])] : latest ? [latest] : []
})
const historyVersions = computed(() => config.value?.versions.filter(item => !featuredVersions.value.some(featured => featured.id === item.id)) ?? [])
watch([title, version, bodyText], () => { reviewed.value = false })
watch(sessionId, () => { config.value = null; loadedSessionId.value = ""; preview.value = null; loadError.value = ""; message.value = ""; actionError.value = ""; clearDraft() })
onMounted(initialize)

async function initialize(): Promise<void> {
  initialLoading.value = true; initialError.value = ""
  try {
    const [staff, sessionList, sourceList, schoolList, activityList] = await Promise.all([getCurrentStaff(), listTourSessions(), listContractSources(), listSchools(), listCatalogItems()])
    canWrite.value = staff.permissionKeys.includes("configuration.write")
    sessions.value = sessionList; sources.value = sourceList; schools.value = schoolList; activities.value = activityList
  } catch (error) { initialError.value = readableContractError(error) }
  finally { initialLoading.value = false }
}
async function loadSession(): Promise<void> {
  if (!sessionId.value || busy.value || loading.value) return
  const id = sessionId.value
  loading.value = true; loadError.value = ""; config.value = null; preview.value = null; message.value = ""; actionError.value = ""; clearDraft()
  try { const result = await getSessionContracts(id); if (id === sessionId.value) { config.value = result; loadedSessionId.value = id } }
  catch (error) { loadError.value = readableContractError(error) }
  finally { loading.value = false }
}
function clearDraft(): void { importedSourceId.value = ""; title.value = ""; version.value = ""; bodyText.value = ""; reviewed.value = false; saveError.value = "" }
async function openPreview(item: ContractTemplate): Promise<void> {
  preview.value = item
  await nextTick()
  previewPanel.value?.focus()
}
function importSource(): void {
  const source = selectedSource.value
  if (!source || busy.value) return
  importedSourceId.value = source.id; title.value = source.title; bodyText.value = source.bodyText; reviewed.value = false; saveError.value = ""
}
async function saveVersion(): Promise<void> {
  if (!canWrite.value || !config.value || !reviewed.value || !importedSourceId.value || busy.value) return
  busy.value = true; saveError.value = ""; message.value = ""
  try {
    const saved = await saveContractVersion(loadedSessionId.value, { sourceId: importedSourceId.value, title: title.value.trim(), version: version.value.trim(), bodyText: bodyText.value, reviewed: true })
    config.value = { ...config.value, versions: [saved, ...config.value.versions] }
    clearDraft(); message.value = "新版本已保存，尚未启用。核对后点击“启用此版本”。"; await openPreview(saved)
  } catch (error) { saveError.value = readableContractError(error) }
  finally { busy.value = false }
}
async function activate(templateId: string | null): Promise<void> {
  if (!canWrite.value || busy.value) return
  busy.value = true; actionError.value = ""; message.value = ""
  try { config.value = await setActiveContract(loadedSessionId.value, templateId); message.value = templateId ? "此版本已启用，后续报名将使用此合同。" : "已停止后续报名使用合同，已有订单保持原合同。" }
  catch (error) { actionError.value = readableContractError(error) }
  finally { busy.value = false }
}
function formatDate(value: string): string { return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) }
</script>

<style scoped>
.contract-form { display: grid; gap: var(--space-4); }
.contract-history-heading { flex-wrap: wrap; }
.contract-history-heading h3 { flex-shrink: 0; }
.contract-history-heading span { min-width: 0; overflow-wrap: anywhere; }
.contracts-page .orders-field { min-width: 0; }
.contract-session-field { flex: 1; }
.contract-session-summary { margin-top: var(--space-5); padding: var(--space-4); border-radius: var(--radius-control); background: var(--surface-secondary); overflow-wrap: anywhere; }
.contract-session-summary h3 { margin: 0; text-wrap: balance; }
.contract-session-summary p:not(.orders-eyebrow) { margin: var(--space-2) 0 0; color: var(--text-secondary); font-size: var(--font-body-sm); }
.contract-form > .orders-button { justify-self: start; }
.contract-form textarea { width: 100%; min-height: calc(var(--space-10) * 4); padding: var(--space-3); border: 1px solid var(--border-default); border-radius: var(--radius-control); color: var(--text-primary); background: var(--surface-primary); font: inherit; line-height: 1.6; resize: vertical; }
.contract-form textarea:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
.contracts-page .orders-field > input, .contracts-page .orders-field > select { min-width: 0; width: 100%; max-width: 100%; }
.contract-review { display: flex; align-items: center; gap: var(--space-2); min-height: var(--size-touch-target); font-size: var(--font-body-sm); }
.contract-review input { accent-color: var(--accent-primary); }
.contract-hint, .contract-preview p, .contract-preview details { color: var(--text-secondary); font-size: var(--font-body-sm); overflow-wrap: anywhere; }
.contract-version { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-3); padding: var(--space-4) 0; border-bottom: 1px solid var(--border-subtle); overflow-wrap: anywhere; }
.contract-version p { margin: var(--space-1) 0 0; color: var(--text-secondary); font-size: var(--font-body-sm); }
.contract-version h4 { margin: var(--space-2) 0 0; font-size: var(--font-body); }
.contract-history > summary { min-height: var(--size-touch-target); cursor: pointer; font-weight: 600; }
.contract-history > summary span { display: block; margin-top: var(--space-1); color: var(--text-secondary); font-size: var(--font-body-sm); font-weight: 400; }
.contracts-page summary:focus-visible, .contract-preview:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
.contract-body { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; font-size: var(--font-body-sm); line-height: 1.8; }
.contracts-page h3 { font-size: var(--font-h3); }
.contract-preview .orders-section-heading { flex-wrap: wrap; }
</style>
