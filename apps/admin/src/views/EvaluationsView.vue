<template>
  <section class="evaluation-page" aria-labelledby="evaluation-title">
    <header class="evaluation-card evaluation-heading">
      <div>
        <p class="evaluation-eyebrow">学生评价</p>
        <h2 id="evaluation-title">批量评价与确认</h2>
        <p>维护导游内部观察、优秀/关注标记和确认后的 A/B 等级；学校报告不会包含内部评语或健康信息。</p>
      </div>
      <button type="button" class="evaluation-button" :disabled="loading || sessionId.trim().length === 0" @click="load">刷新</button>
    </header>
    <section class="evaluation-card">
      <label class="evaluation-field">团期 ID<input v-model="sessionId" maxlength="64" placeholder="由集成入口传入或手动输入" /></label>
      <p v-if="error" class="evaluation-error" role="alert">{{ error }}</p>
      <p v-if="loading" class="evaluation-state">正在加载评价记录...</p>
      <p v-else-if="dashboard && dashboard.evaluations.length === 0" class="evaluation-state">暂无评价。无确认标准时只能保存内部观察，不生成 A/B。</p>
      <div v-else-if="dashboard" class="evaluation-table-wrap">
        <table class="evaluation-table">
          <thead><tr><th>姓名</th><th>班级</th><th>等级</th><th>标记</th><th>内部观察</th><th>确认</th></tr></thead>
          <tbody>
            <tr v-for="row in dashboard.evaluations" :key="row.personRef">
              <td>{{ row.displayName }}</td>
              <td>{{ row.gradeName ?? "" }} {{ row.className ?? "" }}</td>
              <td>{{ row.gradeCode ?? "未评级" }}<small>{{ row.gradeLabel ?? "" }}</small></td>
              <td>{{ row.excellent ? "优秀" : "" }} {{ row.attention ? "关注" : "" }}</td>
              <td>{{ row.internalComment }}</td>
              <td>{{ row.confirmedAt ? "已确认" : "未确认" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue"
import { loadEvaluationDashboard, type EvaluationDashboard } from "@/api/evaluations"
import { readableRosterError } from "@/api/roster.errors"
import "@/styles/evaluations.css"

const sessionId = ref("")
const dashboard = ref<EvaluationDashboard>()
const loading = ref(false)
const error = ref("")

async function load(): Promise<void> {
  loading.value = true
  error.value = ""
  try { dashboard.value = await loadEvaluationDashboard(sessionId.value.trim()) }
  catch (cause) { dashboard.value = undefined; error.value = readableRosterError(cause) }
  finally { loading.value = false }
}
</script>
