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
        <p class="hint">这里只显示已显式分配给当前工作人员的团期和车辆。</p>
      </div>
      <el-button :loading="loading" @click="load">刷新</el-button>
    </header>
    <el-alert v-if="error" type="error" :title="error" show-icon />
    <section class="session-grid">
      <article v-for="session in sessions" :key="session.id" class="session-card">
        <h2>{{ session.code }}</h2>
        <p>{{ new Date(session.startsAt).toLocaleString() }} 至 {{ new Date(session.endsAt).toLocaleString() }}</p>
        <p class="vehicles">车辆：{{ session.vehicleIds.length > 0 ? session.vehicleIds.join('、') : '未分配车辆' }}</p>
        <el-link type="primary" :href="`#/execution/sessions/${encodeURIComponent(session.id)}`">进入执行台</el-link>
      </article>
      <el-empty v-if="!loading && sessions.length === 0" description="暂无执行分配" />
    </section>
  </main>
</template>

<style scoped>
.execution-page { padding: 24px; color: #1f2937; }
.page-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 20px; }
.eyebrow { margin: 0 0 6px; color: #2563eb; font-weight: 700; letter-spacing: .08em; }
h1 { margin: 0; font-size: 28px; }
.hint { margin: 8px 0 0; color: #64748b; }
.session-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
.session-card { border: 1px solid #dbeafe; border-radius: 16px; padding: 18px; background: #fff; box-shadow: 0 12px 30px rgb(15 23 42 / 8%); }
.session-card h2 { margin: 0 0 8px; }
.vehicles { color: #475569; }
@media (max-width: 640px) { .execution-page { padding: 14px; } .page-head { flex-direction: column; } }
</style>
