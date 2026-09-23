<script setup lang="ts">
import { ref } from "vue"
import { readableExecutionError, readHealth, type HealthRead, type PersonRef } from "../api/execution"

const sessionId = ref("")
const personRef = ref("")
const loading = ref(false)
const error = ref("")
const health = ref<HealthRead | null>(null)

async function load(): Promise<void> {
  loading.value = true
  error.value = ""
  health.value = null
  try { health.value = await readHealth(sessionId.value, personRef.value as PersonRef) }
  catch (cause) { error.value = readableExecutionError(cause) }
  finally { loading.value = false }
}
</script>

<template>
  <main class="health-page">
    <header><p class="eyebrow">健康授权</p><h1>健康原文读取</h1><p>读取必须同时满足 health.read、导游车辆分配和家长未撤回授权。</p></header>
    <section class="lookup-card">
      <el-input v-model="sessionId" placeholder="团期 ID" />
      <el-input v-model="personRef" placeholder="personRef，如 paid:line-id" />
      <el-button type="primary" :loading="loading" @click="load">读取</el-button>
    </section>
    <el-alert v-if="error" type="error" :title="error" show-icon />
    <section v-if="health" class="result-card">
      <h2>{{ health.personRef }}</h2>
      <p>授权版本：{{ health.version }}；授权时间：{{ new Date(health.authorizedAt).toLocaleString() }}</p>
      <dl><dt>过敏史</dt><dd>{{ health.health.allergies || '无填写' }}</dd><dt>健康备注</dt><dd>{{ health.health.medicalNotes || '无填写' }}</dd><dt>应急用药</dt><dd>{{ health.health.emergencyMedicine || '无填写' }}</dd></dl>
    </section>
  </main>
</template>

<style scoped>
.health-page { padding: 24px; color: #1f2937; }
.eyebrow { margin: 0 0 6px; color: #2563eb; font-weight: 700; }
.lookup-card, .result-card { display: grid; gap: 12px; max-width: 720px; margin-top: 16px; padding: 18px; border: 1px solid #e2e8f0; border-radius: 16px; background: #fff; }
dl { display: grid; grid-template-columns: 120px 1fr; gap: 10px; }
dt { font-weight: 700; color: #475569; } dd { margin: 0; }
@media (max-width: 640px) { .health-page { padding: 14px; } dl { grid-template-columns: 1fr; } }
</style>
