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

    <section v-if="canImportRoster" class="roster-import-card" aria-labelledby="roster-import-title">
      <div class="roster-table-heading">
        <div>
          <h3 id="roster-import-title">导入需求方名单模板</h3>
          <p>导入仅生成名单核对记录，不生成订单，也不计入已付款人数和金额。</p>
        </div>
      </div>
      <form class="roster-import-form" @submit.prevent="submitImport">
        <div class="field">
          <label for="roster-import-template">模板类型</label>
          <select id="roster-import-template" v-model="importTemplate">
            <option value="parent_child">1-2 年级亲子模板</option>
            <option value="grade_3_6">3-6 年级学生模板</option>
            <option value="teacher">教师名单模板</option>
          </select>
        </div>
        <div class="field">
          <label for="roster-import-file">Excel 文件</label>
          <input id="roster-import-file" ref="importFileInput" type="file" accept=".xlsx" @change="selectImportFile">
        </div>
        <div class="roster-actions">
          <button type="submit" :disabled="importDisabled">{{ importing ? "导入中..." : "导入名单" }}</button>
          <button v-if="importResult && importResult.errorCount > 0" type="button" class="roster-button--secondary" @click="downloadImportErrors">
            下载错误明细
          </button>
        </div>
      </form>
      <p v-if="importFormError" class="roster-state roster-state--error" role="alert">{{ importFormError }}</p>
      <p v-if="importResult" class="roster-state" role="status">
        已处理 {{ importResult.totalRows }} 行，新增 {{ importResult.importedCount }} 人，跳过重复 {{ importResult.duplicateCount }} 人，错误 {{ importResult.errorCount }} 条。
      </p>
      <div v-if="importResult && importResult.errors.length > 0" class="roster-table-wrap">
        <table class="roster-table" aria-label="名单导入错误表">
          <thead>
            <tr>
              <th scope="col">行号</th>
              <th scope="col">角色</th>
              <th scope="col">字段</th>
              <th scope="col">错误</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="errorRow in importResult.errors" :key="`${errorRow.rowNumber}-${errorRow.role ?? 'row'}-${errorRow.field}`">
              <td data-label="行号">{{ errorRow.rowNumber }}</td>
              <td data-label="角色">{{ roleLabel(errorRow.role) }}</td>
              <td data-label="字段">{{ errorRow.fieldLabel }}</td>
              <td data-label="错误">{{ errorRow.messageLabel }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

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
import { computed, onMounted, ref, watch } from "vue"

import { downloadRosterExport, downloadRosterImportErrors, getRosterSummary, importRoster, readableRosterError } from "@/api/roster"
import type { RosterImportResult, RosterImportTemplate, RosterQuery, RosterRow, RosterSummary } from "@/api/roster"
import { getCurrentStaff } from "@/api/auth"
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
const canImportRoster = ref(false)
const importTemplate = ref<RosterImportTemplate>("parent_child")
const importFile = ref<File | null>(null)
const importFileInput = ref<HTMLInputElement>()
const importing = ref(false)
const importFormError = ref("")
const importResult = ref<RosterImportResult | null>(null)

const hasTourSessionId = computed(() => filters.tourSessionId.trim().length > 0)
const queryDisabled = computed(() => !hasTourSessionId.value || loading.value || exporting.value || optionsBusy.value || !!selectionError.value)
const exportDisabled = computed(() => queryDisabled.value)
const importDisabled = computed(() => importing.value || optionsBusy.value || importFile.value === null || buildImportQuery() === undefined)
const rows = computed<readonly RosterRow[]>(() => summary.value?.rows ?? [])
const paidHeadcountText = computed(() => summary.value ? `${summary.value.paidHeadcount} 人` : "待查询")
const paidAmountText = computed(() => summary.value ? formatFen(summary.value.paidAmountFen) : "待查询")
watch(filters, () => { summary.value = undefined; error.value = ""; exportError.value = ""; formError.value = ""; importFormError.value = ""; importResult.value = null })
onMounted(loadImportPermission)

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

async function submitImport(): Promise<void> {
  const query = buildImportQuery()
  if (query === undefined || importFile.value === null) {
    importFormError.value = importTemplate.value === "teacher" ? "请先选择团期、学校和 Excel 文件。" : "请先选择团期、学校、年级、班级和 Excel 文件。"
    return
  }
  importing.value = true
  importFormError.value = ""
  importResult.value = null
  try {
    importResult.value = await importRoster({ ...query, template: importTemplate.value, file: importFile.value })
  } catch (caught) {
    importFormError.value = readableRosterError(caught)
  } finally {
    importing.value = false
  }
}

async function downloadImportErrors(): Promise<void> {
  if (importResult.value === null) return
  try {
    await downloadRosterImportErrors(importResult.value.id)
  } catch (caught) {
    importFormError.value = readableRosterError(caught)
  }
}

function selectImportFile(event: Event): void {
  const input = event.target
  importFile.value = input instanceof HTMLInputElement ? input.files?.[0] ?? null : null
  importResult.value = null
  importFormError.value = ""
}

async function loadImportPermission(): Promise<void> {
  try {
    const staff = await getCurrentStaff()
    canImportRoster.value = staff.permissionKeys.includes("roster.import")
  } catch {
    canImportRoster.value = false
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

function buildImportQuery(): RosterQuery | undefined {
  const base = buildQuery()
  const schoolId = optionalText(filters.schoolId) ?? selectedSession.value?.organizationId
  if (base === undefined || schoolId === undefined) {
    return undefined
  }
  if (importTemplate.value === "teacher") {
    const gradeId = optionalText(filters.gradeId)
    const classId = optionalText(filters.classId)
    return {
      ...base,
      schoolId,
      ...(gradeId === undefined ? {} : { gradeId }),
      ...(classId === undefined ? {} : { classId }),
    }
  }  const gradeId = optionalText(filters.gradeId)
  const classId = optionalText(filters.classId)
  if (gradeId === undefined || classId === undefined) {
    return undefined
  }
  return { ...base, schoolId, gradeId, classId }
}

function roleLabel(role: "student" | "guardian" | "teacher" | null): string {
  if (role === "student") return "学生"
  if (role === "guardian") return "家长"
  if (role === "teacher") return "教师"
  return "整行"
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
