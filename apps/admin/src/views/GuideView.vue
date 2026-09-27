<script setup lang="ts">
import { onMounted, ref } from "vue"
import { listGuideSessions, readableExecutionError, type GuideSessionSummary } from "../api/execution"

const loading = ref(false)
const error = ref("")
const sessions = ref<readonly GuideSessionSummary[]>([])

async function load(): Promise<void> {
  loading.value = true
  error.value = ""
  try {
    sessions.value = await listGuideSessions()
  } catch (cause) {
    error.value = readableExecutionError(cause)
  } finally {
    loading.value = false
  }
}

onMounted(() => { void load() })
</script>

<template>
  <main class="execution-page">
    <header class="page-head">
      <div>
        <p class="eyebrow">导游执行</p>
        <h1>我的团期</h1>
        <p class="hint">查看已指派的团期，按已确认的人车安排开展工作。</p>
      </div>
      <el-button :loading="loading" @click="load">刷新</el-button>
    </header>
    <el-alert v-if="error" type="error" :title="error" show-icon />
    <section class="session-grid">
      <article v-for="session in sessions" :key="session.id" class="session-card">
        <h2>{{ session.code }}</h2>
        <p>{{ new Date(session.startsAt).toLocaleString() }} 至 {{ new Date(session.endsAt).toLocaleString() }}</p>
        <p class="vehicles">{{ session.vehicleIds.length > 0 ? `已指派 ${session.vehicleIds.length} 辆车` : '全团查看' }}</p>
        <RouterLink :to="`/execution/sessions/${encodeURIComponent(session.id)}`">进入执行台</RouterLink>
      </article>
      <el-empty v-if="!loading && sessions.length === 0" description="暂无执行分配" />
    </section>
  </main>
</template>

<style scoped>
.execution-page { color: var(--text-primary); min-width: 0; }
.page-head { display: flex; justify-content: space-between; gap: var(--space-4); align-items: flex-start; margin-bottom: var(--space-5); }
.eyebrow { margin: 0 0 var(--space-2); color: var(--accent-primary); font-weight: 700; }
h1 { margin: 0; font-size: var(--font-h1); }
.hint { margin: var(--space-2) 0 0; color: var(--text-secondary); }
.session-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: var(--space-4); }
.session-card { min-width: 0; border-radius: var(--radius-card); padding: var(--space-5); background: var(--surface-elevated); }
.session-card h2 { margin: 0 0 var(--space-2); overflow-wrap: anywhere; font-size: var(--font-h2); }
.vehicles { color: var(--text-secondary); } a { color: var(--accent-primary); }
@media (max-width: 640px) { .page-head { flex-direction: column; } }
</style>
