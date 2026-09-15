<template>
  <section class="roster-page" aria-labelledby="roster-title">
    <header class="roster-heading">
      <div>
        <p class="roster-heading__eyebrow">名单统计</p>
        <h2 id="roster-title">已支付名单与金额统计</h2>
      </div>
      <p>按团期查看已支付学生名单，可继续用学校、年级和班级 ID 缩小范围。</p>
    </header>

    <form class="roster-filter" aria-labelledby="roster-filter-title" @submit.prevent="submitQuery">
      <fieldset :disabled="loading || exporting">
        <legend id="roster-filter-title">筛选条件</legend>
        <div class="field">
          <label for="roster-tour-session-id">团期 ID</label>
          <input id="roster-tour-session-id" v-model.trim="filters.tourSessionId" required placeholder="例如 session-1" />
        </div>
        <div class="field">
          <label for="roster-school-id">学校 ID</label>
          <input id="roster-school-id" v-model.trim="filters.schoolId" placeholder="可选" />
        </div>
        <div class="field">
          <label for="roster-grade-id">年级 ID</label>
          <input id="roster-grade-id" v-model.trim="filters.gradeId" placeholder="可选" />
        </div>
        <div class="field">
          <label for="roster-class-id">班级 ID</label>
          <input id="roster-class-id" v-model.trim="filters.classId" placeholder="可选" />
        </div>
        <div class="roster-actions">
          <button type="submit" :disabled="queryDisabled">{{ loading ? "查询中..." : "查询名单" }}</button>
          <button type="button" :disabled="exportDisabled" class="roster-button--secondary" @click="exportFile">
            {{ exporting ? "导出中..." : "导出 Excel" }}
          </button>
        </div>
      </fieldset>
      <p v-if="formError" class="roster-state roster-state--error" role="alert">{{ formError }}</p>
      <p v-if="exportError" class="roster-state roster-state--error" role="alert">{{ exportError }}</p>
    </form>

    <div class="roster-stat-grid" aria-label="名单汇总">
      <article class="roster-stat-card">
        <span>已支付人数</span>
        <strong>{{ paidHeadcountText }}</strong>
      </article>
      <article class="roster-stat-card">
        <span>已支付金额</span>
        <strong class="roster-money">{{ paidAmountText }}</strong>
      </article>
    </div>

    <section class="roster-table-card" aria-labelledby="roster-table-title">
      <div class="roster-table-heading">
        <h3 id="roster-table-title">已支付名单</h3>
        <span>{{ rows.length }} 条记录</span>
      </div>

      <p v-if="loading" class="roster-state">正在查询名单...</p>
      <p v-if="error" class="roster-state roster-state--error" role="alert">{{ error }}</p>
      <p v-if="!loading && !error && rows.length === 0" class="roster-state">暂无名单数据，请调整筛选条件后查询。</p>

      <div v-if="rows.length > 0" class="roster-table-wrap">
        <table class="roster-table" aria-label="已支付名单统计表">
          <thead>
            <tr>
              <th scope="col">姓名</th>
              <th scope="col">学校</th>
              <th scope="col">年级</th>
              <th scope="col">班级</th>
              <th scope="col">金额</th>
              <th scope="col">参与人 ID</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.participantId">
              <td data-label="姓名">{{ row.displayName }}</td>
              <td data-label="学校">{{ row.schoolName }}</td>
              <td data-label="年级">{{ row.gradeName ?? "未设置" }}</td>
              <td data-label="班级">{{ row.className ?? "未设置" }}</td>
              <td data-label="金额" class="roster-money">{{ formatFen(row.amountFen) }}</td>
              <td data-label="参与人 ID">{{ row.participantId }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue"

import { downloadRosterExport, getRosterSummary, readableRosterError } from "@/api/roster"
import type { RosterQuery, RosterRow, RosterSummary } from "@/api/roster"
import "@/styles/roster.css"
import { formatFen } from "@/views/roster/format"

const filters = reactive({
  tourSessionId: "",
  schoolId: "",
  gradeId: "",
  classId: "",
})
const summary = ref<RosterSummary>()
const loading = ref(false)
const exporting = ref(false)
const error = ref("")
const exportError = ref("")
const formError = ref("")

const hasTourSessionId = computed(() => filters.tourSessionId.trim().length > 0)
const queryDisabled = computed(() => !hasTourSessionId.value || loading.value)
const exportDisabled = computed(() => !hasTourSessionId.value || exporting.value)
const rows = computed<readonly RosterRow[]>(() => summary.value?.rows ?? [])
const paidHeadcountText = computed(() => `${summary.value?.paidHeadcount ?? 0} 人`)
const paidAmountText = computed(() => formatFen(summary.value?.paidAmountFen ?? 0))

async function submitQuery(): Promise<void> {
  const query = buildQuery()
  if (query === undefined) {
    formError.value = "请先填写团期 ID。"
    return
  }

  loading.value = true
  formError.value = ""
  error.value = ""
  exportError.value = ""

  try {
    summary.value = await getRosterSummary(query)
  } catch (caught) {
    error.value = readableRosterError(caught)
  } finally {
    loading.value = false
  }
}

async function exportFile(): Promise<void> {
  const query = buildQuery()
  if (query === undefined) {
    formError.value = "请先填写团期 ID。"
    return
  }

  exporting.value = true
  formError.value = ""
  exportError.value = ""

  try {
    await downloadRosterExport(query)
  } catch (caught) {
    exportError.value = readableRosterError(caught)
  } finally {
    exporting.value = false
  }
}

function buildQuery(): RosterQuery | undefined {
  const tourSessionId = filters.tourSessionId.trim()
  if (tourSessionId.length === 0) {
    return undefined
  }

  const schoolId = optionalText(filters.schoolId)
  const gradeId = optionalText(filters.gradeId)
  const classId = optionalText(filters.classId)

  return {
    tourSessionId,
    ...(schoolId === undefined ? {} : { schoolId }),
    ...(gradeId === undefined ? {} : { gradeId }),
    ...(classId === undefined ? {} : { classId }),
  }
}

function optionalText(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}
</script>
