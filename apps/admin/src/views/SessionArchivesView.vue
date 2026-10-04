<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import { archiveError, archiveLabels, createArchive, downloadArchive, listArchiveSessions, listArchives, type ArchiveKey, type ArchiveSession, type ArchiveSummary } from "../api/session-archives"

const sessions = ref<readonly ArchiveSession[]>([])
const sessionId = ref("")
const selected = ref<ArchiveKey[]>([])
const archives = ref<readonly ArchiveSummary[]>([])
const busy = ref(false)
const error = ref("")
const notice = ref("")
const loaded = ref(false)
const current = computed(() => sessions.value.find(session => session.id === sessionId.value))
const time = (value: string): string => new Date(value).toLocaleString("zh-CN", { hour12: false })

async function initialize(): Promise<void> {
  busy.value = true; error.value = ""
  try { sessions.value = await listArchiveSessions() }
  catch (cause) { error.value = archiveError(cause) }
  finally { busy.value = false }
}
async function load(): Promise<void> {
  if (!sessionId.value) return
  busy.value = true; error.value = ""; loaded.value = false
  try { archives.value = await listArchives(sessionId.value); loaded.value = true }
  catch (cause) { error.value = archiveError(cause) }
  finally { busy.value = false }
}
async function create(): Promise<void> {
  busy.value = true; error.value = ""; notice.value = ""
  try {
    const created = await createArchive(sessionId.value, selected.value)
    archives.value = await listArchives(sessionId.value)
    loaded.value = true
    notice.value = `已保存归档 v${created.version}，共 ${created.sections.length} 类资料。`
  } catch (cause) { error.value = archiveError(cause) }
  finally { busy.value = false }
}
async function download(archive: ArchiveSummary): Promise<void> {
  busy.value = true; error.value = ""
  try { await downloadArchive(sessionId.value, archive) }
  catch (cause) { error.value = archiveError(cause) }
  finally { busy.value = false }
}
watch(sessionId, () => { selected.value = []; archives.value = []; loaded.value = false; notice.value = ""; error.value = "" })
onMounted(() => { void initialize() })
</script>

<template>
  <main class="archives">
    <header><p class="eyebrow">运营管理</p><h1>团期资料归档</h1><p>按团期保存资料版本，查询并下载当时的记录。</p></header>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="notice" class="success" role="status">{{ notice }}</p>
    <p v-if="busy" role="status">正在处理，请稍候…</p>
    <form class="panel" @submit.prevent="load">
      <label>选择团期<select v-model="sessionId" required :disabled="busy"><option value="">请选择团期</option><option v-for="session in sessions" :key="session.id" :value="session.id">{{ session.code }}</option></select></label>
      <div class="actions"><button type="submit" :disabled="busy || !sessionId">查询归档</button><button type="button" class="secondary" :disabled="busy" @click="initialize">刷新团期</button></div>
      <p v-if="!busy && sessions.length === 0 && !error">当前账号暂无可归档的团期，请联系管理员核对资料权限及团期范围。</p>
    </form>
    <form v-if="current" class="panel" @submit.prevent="create">
      <h2>保存新版本</h2>
      <p>仅显示当前有权导出的资料。新版本保留旧版本，各类资料分别记录采集时间。</p>
      <fieldset :disabled="busy"><legend>选择归档资料</legend><div class="choices"><label v-for="key in current.sections" :key="key" class="choice"><input v-model="selected" type="checkbox" :value="key">{{ archiveLabels[key] }}</label></div></fieldset>
      <p>归档保留业务状态与必要记录，不含健康正文、自由备注、内部评价、证件和联系方式原文。未确认、失效的分车安排仅保留状态。</p>
      <button type="submit" :disabled="busy || selected.length === 0">保存新归档版本</button>
    </form>
    <section v-if="loaded" class="panel" aria-labelledby="archive-versions">
      <h2 id="archive-versions">归档版本</h2>
      <p>仅展示并下载当前权限允许的资料，下载目录列明实际包含的类别。</p>
      <p v-if="archives.length === 0">该团期暂无可查看的归档版本。</p>
      <article v-for="archive in archives" :key="archive.id" class="version">
        <h3>归档 v{{ archive.version }}</h3><p>{{ time(archive.createdAt) }} · {{ archive.creatorName }}</p>
        <ul><li v-for="section in archive.sections" :key="section.key">{{ archiveLabels[section.key] }}：{{ section.rowCount }} 条 · {{ section.status === 'captured' ? '已保存' : section.status }} · {{ time(section.capturedAt) }}</li></ul>
        <button type="button" :disabled="busy" @click="download(archive)">下载 v{{ archive.version }} Excel</button>
      </article>
    </section>
  </main>
</template>

<style scoped>
.archives { display: grid; gap: var(--space-4); min-width: 0; color: var(--text-primary); }
header, .panel { display: grid; gap: var(--space-3); padding: var(--space-5); min-width: 0; background: var(--surface-elevated); border-radius: var(--radius-card); }
h1, h2, h3, p { margin: 0; overflow-wrap: anywhere; } h1 { font-size: var(--font-h1); } h2 { font-size: var(--font-h2); } h3 { font-size: var(--font-h3); }
p, li { color: var(--text-secondary); line-height: 1.6; } .eyebrow { color: var(--accent-primary); } .error { color: var(--status-error); } .success { color: var(--status-success); }
label { display: grid; gap: var(--space-2); min-width: 0; } select, button { min-width: 0; max-width: 100%; min-height: var(--size-touch-target); padding: var(--space-2) var(--space-3); font: inherit; border: 1px solid var(--border-default); border-radius: var(--radius-control); }
select { width: 100%; color: var(--text-primary); background: var(--surface-primary); } button { cursor: pointer; background: var(--accent-primary); color: var(--on-accent); } button.secondary { background: var(--surface-elevated); color: var(--accent-primary); } button:disabled { cursor: not-allowed; opacity: .6; }
.actions, .choices { display: flex; flex-wrap: wrap; gap: var(--space-3); } .choice { display: flex; align-items: center; min-height: var(--size-touch-target); gap: var(--space-2); } fieldset { min-width: 0; padding: var(--space-3); border: 1px solid var(--border-default); border-radius: var(--radius-control); }
.version { display: grid; gap: var(--space-2); padding: var(--space-4); min-width: 0; background: var(--surface-secondary); border-radius: var(--radius-control); } ul { margin: 0; padding-left: var(--space-5); } li { overflow-wrap: anywhere; }
button:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
@media (max-width: 640px) { .actions { flex-direction: column; } .choices { flex-direction: column; gap: var(--space-1); } }
</style>
