<template>
  <section class="evaluation-page" aria-labelledby="feedback-title">
    <header class="evaluation-card evaluation-heading">
      <div>
        <p class="evaluation-eyebrow">服务反馈</p>
        <h2 id="feedback-title">反馈审核与公开</h2>
        <p>服务反馈独立于学生等级；未审核或未授权公开的反馈不会出现在公开列表。</p>
      </div>
      <button type="button" class="evaluation-button" :disabled="loading || sessionId.trim().length === 0" @click="load">刷新</button>
    </header>
    <section class="evaluation-card">
      <label class="evaluation-field">团期 ID<input v-model="sessionId" maxlength="64" /></label>
      <p v-if="dashboard" class="evaluation-state">全部 {{ dashboard.summary.totalCount }} 条，公开 {{ dashboard.summary.publicCount }} 条，均分 {{ dashboard.summary.averageRating }}</p>
      <p v-if="error" class="evaluation-error" role="alert">{{ error }}</p>
      <div v-if="dashboard" class="feedback-list">
        <article v-for="item in dashboard.items" :key="item.id" class="feedback-item">
          <strong>{{ item.source === "family" ? "家庭" : "学校" }} / {{ item.rating }}分 / {{ item.status }}</strong>
          <p>{{ item.content }}</p>
          <small>{{ item.allowPublic ? "允许公开" : "不公开" }}；公开摘要：{{ item.publicExcerpt || "无" }}</small>
        </article>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue"
import { loadFeedbackDashboard, type FeedbackDashboard } from "@/api/feedback"
import { readableRosterError } from "@/api/roster.errors"
import "@/styles/evaluations.css"

const sessionId = ref("")
const dashboard = ref<FeedbackDashboard>()
const loading = ref(false)
const error = ref("")

async function load(): Promise<void> {
  loading.value = true
  error.value = ""
  try { dashboard.value = await loadFeedbackDashboard(sessionId.value.trim()) }
  catch (cause) { dashboard.value = undefined; error.value = readableRosterError(cause) }
  finally { loading.value = false }
}
</script>
