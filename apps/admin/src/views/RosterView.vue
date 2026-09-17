<template>
  <section class="roster-page" aria-labelledby="roster-title">
    <header class="roster-heading">
      <div>
        <p class="roster-heading__eyebrow">名单统计</p>
        <h2 id="roster-title">已支付名单与金额统计</h2>
      </div>
      <p>按名称选择团期、学校、年级和班级，查询已付款参加人员与费用。</p>
    </header>

    <form class="roster-filter" aria-labelledby="roster-filter-title" @submit.prevent="submitQuery">
      <fieldset :disabled="loading || exporting || optionsLoading">
        <legend id="roster-filter-title">筛选条件</legend>
        <div class="field">
          <label for="roster-tour-session-id">团期</label>
          <select id="roster-tour-session-id" v-model="filters.tourSessionId" required>
            <option value="">{{ optionsLoading ? "团期加载中..." : visibleSessions.length === 0 ? "暂无可选团期" : "请选择团期" }}</option>
            <option v-for="session in visibleSessions" :key="session.id" :value="session.id">{{ sessionLabel(session) }}</option>
          </select>
          <p v-if="selectedSession" class="roster-selection-label">{{ sessionLabel(selectedSession) }}</p>
        </div>
        <div class="field">
          <label for="roster-school-id">学校</label>
          <select id="roster-school-id" v-model="filters.schoolId">
            <option value="">全部学校</option>
            <option v-for="school in schools" :key="school.id" :value="school.id">{{ school.name }}</option>
          </select>
        </div>
        <div class="field">
          <label for="roster-grade-id">年级</label>
          <select id="roster-grade-id" v-model="filters.gradeId" :disabled="filters.schoolId === '' || gradeLoading || !!gradeError">
            <option value="">{{ gradeLoading ? "年级加载中..." : filters.schoolId === '' ? "请先选择学校" : grades.length === 0 ? "暂无年级" : "全部年级" }}</option>
            <option v-for="grade in grades" :key="grade.id" :value="grade.id">{{ grade.name }}</option>
          </select>
        </div>
        <div class="field">
          <label for="roster-class-id">班级</label>
          <select id="roster-class-id" v-model="filters.classId" :disabled="filters.gradeId === '' || classLoading || !!classError">
            <option value="">{{ classLoading ? "班级加载中..." : filters.gradeId === '' ? "请先选择年级" : classes.length === 0 ? "暂无班级" : "全部班级" }}</option>
            <option v-for="schoolClass in classes" :key="schoolClass.id" :value="schoolClass.id">{{ schoolClass.name }}</option>
          </select>
        </div>
        <div class="roster-actions">
          <button type="submit" :disabled="queryDisabled">{{ loading ? "查询中..." : "查询名单" }}</button>
          <button type="button" :disabled="exportDisabled" class="roster-button--secondary" @click="exportFile">
            {{ exporting ? "导出中..." : "导出 Excel" }}
          </button>
        </div>
      </fieldset>
      <p v-if="optionsLoading" class="roster-state" role="status">正在加载筛选选项...</p>
      <p v-if="optionsError" class="roster-state roster-state--error" role="alert">{{ optionsError }} <button type="button" @click="loadOptions">重新加载选项</button></p>
      <p v-if="gradeError" class="roster-state roster-state--error" role="alert">{{ gradeError }} <button type="button" @click="loadGrades">重试年级</button></p>
      <p v-if="classError" class="roster-state roster-state--error" role="alert">{{ classError }} <button type="button" @click="loadClasses">重试班级</button></p>
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
      <p v-if="!loading && !error && !summary" class="roster-state">请选择团期后查询名单。</p>
      <p v-if="!loading && !error && summary && rows.length === 0" class="roster-state">暂无名单数据，请调整筛选条件后查询。</p>

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
import { computed, ref, watch } from "vue"

import { downloadRosterExport, getRosterSummary, readableRosterError } from "@/api/roster"
import type { RosterQuery, RosterRow, RosterSummary } from "@/api/roster"
import "@/styles/roster.css"
import { formatFen } from "@/views/roster/format"
import { useRosterFilters } from "@/views/roster/useRosterFilters"

const { filters, schools, grades, classes, visibleSessions, optionsLoading, gradeLoading, classLoading, optionsError, gradeError, classError, optionsBusy, selectionError, loadOptions, loadGrades, loadClasses, sessionLabel } = useRosterFilters()
const selectedSession = computed(() => visibleSessions.value.find(session => session.id === filters.tourSessionId))
const summary = ref<RosterSummary>()
const loading = ref(false)
const exporting = ref(false)
const error = ref("")
const exportError = ref("")
const formError = ref("")

const hasTourSessionId = computed(() => filters.tourSessionId.trim().length > 0)
const queryDisabled = computed(() => !hasTourSessionId.value || loading.value || exporting.value || optionsBusy.value || !!selectionError.value)
const exportDisabled = computed(() => queryDisabled.value)
const rows = computed<readonly RosterRow[]>(() => summary.value?.rows ?? [])
const paidHeadcountText = computed(() => summary.value ? `${summary.value.paidHeadcount} 人` : "待查询")
const paidAmountText = computed(() => summary.value ? formatFen(summary.value.paidAmountFen) : "待查询")
watch(filters, () => { summary.value = undefined; error.value = ""; exportError.value = ""; formError.value = "" })

async function submitQuery(): Promise<void> {
  const query = buildQuery()
  if (query === undefined) {
    formError.value = "请先选择团期。"
    return
  }

  loading.value = true
  formError.value = ""
  error.value = ""
  summary.value = undefined
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
    formError.value = "请先选择团期。"
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
