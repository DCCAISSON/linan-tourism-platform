<template>
  <section class="roster-page" aria-labelledby="travelers-title">
    <header class="roster-heading">
      <div>
        <p class="roster-heading__eyebrow">统一出行名单</p>
        <h2 id="travelers-title">来源、资格与冲突核对</h2>
      </div>
      <p>合并已付款人员和导入名单。导入不会增加实收金额，冲突人员需先核对后再用于分车和保险。</p>
    </header>

    <form class="roster-filter" aria-labelledby="travelers-filter-title" @submit.prevent="submitQuery">
      <fieldset :disabled="loading || exporting || optionsLoading">
        <legend id="travelers-filter-title">筛选条件</legend>
        <div class="field">
          <label for="travelers-tour-session-id">团期</label>
          <select id="travelers-tour-session-id" v-model="filters.tourSessionId" required>
            <option value="">{{ optionsLoading ? "团期加载中..." : visibleSessions.length === 0 ? "暂无可选团期" : "请选择团期" }}</option>
            <option v-for="session in visibleSessions" :key="session.id" :value="session.id">{{ sessionLabel(session) }}</option>
          </select>
          <p v-if="selectedSession" class="roster-selection-label">{{ sessionLabel(selectedSession) }}</p>
        </div>
        <div class="field">
          <label for="travelers-school-id">学校</label>
          <select id="travelers-school-id" v-model="filters.schoolId">
            <option value="">全部学校</option>
            <option v-for="school in schools" :key="school.id" :value="school.id">{{ school.name }}</option>
          </select>
        </div>
        <div class="field">
          <label for="travelers-grade-id">年级</label>
          <select id="travelers-grade-id" v-model="filters.gradeId" :disabled="filters.schoolId === '' || gradeLoading || !!gradeError">
            <option value="">{{ gradeLoading ? "年级加载中..." : filters.schoolId === '' ? "请先选择学校" : grades.length === 0 ? "暂无年级" : "全部年级" }}</option>
            <option v-for="grade in grades" :key="grade.id" :value="grade.id">{{ grade.name }}</option>
          </select>
        </div>
        <div class="field">
          <label for="travelers-class-id">班级</label>
          <select id="travelers-class-id" v-model="filters.classId" :disabled="filters.gradeId === '' || classLoading || !!classError">
            <option value="">{{ classLoading ? "班级加载中..." : filters.gradeId === '' ? "请先选择年级" : classes.length === 0 ? "暂无班级" : "全部班级" }}</option>
            <option v-for="schoolClass in classes" :key="schoolClass.id" :value="schoolClass.id">{{ schoolClass.name }}</option>
          </select>
        </div>
        <div class="field">
          <label for="travelers-source">来源</label>
          <select id="travelers-source" v-model="sourceFilter">
            <option value="">全部来源</option>
            <option value="paid">已付款</option>
            <option value="imported">导入</option>
          </select>
        </div>
        <div class="field">
          <label for="travelers-search">搜索</label>
          <input id="travelers-search" v-model="search" type="search" placeholder="姓名或来源引用">
        </div>
        <label class="roster-checkbox"><input v-model="includeInactive" type="checkbox"> 显示无效人员</label>
        <div class="roster-actions">
          <button type="submit" :disabled="queryDisabled">{{ loading ? "查询中..." : "查询出行名单" }}</button>
          <button type="button" class="roster-button--secondary" :disabled="exportDisabled" @click="exportFile">
            {{ exporting ? "导出中..." : "导出 Excel" }}
          </button>
        </div>
      </fieldset>
      <p v-if="optionsLoading" class="roster-state" role="status">正在加载筛选选项...</p>
      <p v-if="optionsError" class="roster-state roster-state--error" role="alert">{{ optionsError }} <button type="button" @click="loadOptions">重新加载选项</button></p>
      <p v-if="gradeError" class="roster-state roster-state--error" role="alert">{{ gradeError }} <button type="button" @click="loadGrades">重试年级</button></p>
      <p v-if="classError" class="roster-state roster-state--error" role="alert">{{ classError }} <button type="button" @click="loadClasses">重试班级</button></p>
      <p v-if="formError" class="roster-state roster-state--error" role="alert">{{ formError }}</p>
    </form>

    <div class="roster-stat-grid" aria-label="出行名单汇总">
      <article class="roster-stat-card"><span>有效人员</span><strong>{{ list ? `${list.activeCount} 人` : "待查询" }}</strong></article><article class="roster-stat-card"><span>无效人员</span><strong>{{ list ? `${list.inactiveCount} 人` : "待查询" }}</strong></article><article class="roster-stat-card"><span>待核对冲突</span><strong>{{ list ? `${list.conflictCount} 条` : "待查询" }}</strong></article>
    </div>

    <section class="roster-table-card" aria-labelledby="travelers-table-title">
      <div class="roster-table-heading">
        <div>
          <h3 id="travelers-table-title">出行人员</h3>
          <span v-if="list">版本 {{ list.rosterVersion.slice(0, 12) }}，共 {{ list.total }} 条</span>
        </div>
      </div>
      <p v-if="loading" class="roster-state">正在查询出行名单...</p>
      <p v-if="error" class="roster-state roster-state--error" role="alert">{{ error }}</p>
      <p v-if="!loading && !error && !list" class="roster-state">请选择团期后查询名单。</p>
      <p v-if="!loading && !error && list && list.travelers.length === 0" class="roster-state">暂无人员，请调整筛选条件。</p>

      <div v-if="list && list.travelers.length > 0" class="roster-table-wrap">
        <table class="roster-table" aria-label="统一出行名单表">
          <thead>
            <tr>
              <th scope="col">姓名</th>
              <th scope="col">来源</th>
              <th scope="col">班级</th>
              <th scope="col">证件/手机</th>
              <th scope="col">资格</th>
              <th scope="col">冲突</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in list.travelers" :key="row.personRef">
              <td data-label="姓名">{{ row.displayName }}</td>
              <td data-label="来源">{{ sourceLabel(row) }}<br><small>{{ row.sourceRefs.join("；") }}</small></td>
              <td data-label="班级">{{ row.gradeName ?? "未设置" }} {{ row.className ?? "" }}</td>
              <td data-label="证件/手机">{{ row.identityMasked ?? "无证件" }}<br>{{ row.phoneMasked ?? "无手机" }}</td>
              <td data-label="资格">{{ eligibilityLabel(row) }}<br><small>{{ row.eligibilityReason ?? "" }}</small></td>
              <td data-label="冲突">{{ conflictLabel(row.conflict?.code ?? null) }}</td>
              <td data-label="操作">
                <button v-if="canCorrect && row.sourceRefs.some(ref => ref.startsWith('imported:'))" type="button" class="roster-button--secondary" @click="openConfirm(row)">
                  确认资格
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <form v-if="confirming" class="roster-import-card" aria-labelledby="travelers-confirm-title" @submit.prevent="saveConfirmation">
      <h3 id="travelers-confirm-title">确认资格</h3>
      <p>{{ confirming.displayName }}：{{ confirming.sourceRefs.join("；") }}</p>
      <div class="field">
        <label for="travelers-confirm-reason">确认原因</label>
        <textarea id="travelers-confirm-reason" v-model="confirmReason" rows="3" required maxlength="500" />
      </div>
      <div class="roster-actions">
        <button type="submit" :disabled="savingConfirmation">{{ savingConfirmation ? "保存中..." : "保存确认" }}</button><button type="button" class="roster-button--secondary" :disabled="savingConfirmation" @click="closeConfirm">取消</button>
      </div>
      <p v-if="confirmError" class="roster-state roster-state--error" role="alert">{{ confirmError }}</p>
    </form>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import { getCurrentStaff } from "@/api/auth"
import { confirmTravelerEligibility, downloadTravelersExport, getTravelers, readableRosterError } from "@/api/travelers"
import type { TravelerConflictCode, TravelerList, TravelerRow, TravelerSource } from "@/api/travelers.types"
import "@/styles/roster.css"
import { useRosterFilters } from "@/views/roster/useRosterFilters"

const { filters, schools, grades, classes, visibleSessions, optionsLoading, gradeLoading, classLoading, optionsError, gradeError, classError, optionsBusy, selectionError, loadOptions, loadGrades, loadClasses, sessionLabel } = useRosterFilters()
const selectedSession = computed(() => visibleSessions.value.find(session => session.id === filters.tourSessionId))
const list = ref<TravelerList>()
const loading = ref(false)
const exporting = ref(false)
const error = ref("")
const formError = ref("")
const includeInactive = ref(false)
const sourceFilter = ref<"" | TravelerSource>("")
const search = ref("")
const canCorrect = ref(false)
const confirming = ref<TravelerRow | null>(null)
const confirmReason = ref("")
const confirmError = ref("")
const savingConfirmation = ref(false)
const hasTourSessionId = computed(() => filters.tourSessionId.trim().length > 0)
const queryDisabled = computed(() => !hasTourSessionId.value || loading.value || optionsBusy.value || !!selectionError.value)
const exportDisabled = computed(() => queryDisabled.value || exporting.value)

watch(filters, clearResults)
watch([includeInactive, sourceFilter, search], clearResults)
onMounted(loadPermission)

async function submitQuery(): Promise<void> {
  const tourSessionId = filters.tourSessionId.trim()
  if (tourSessionId.length === 0) {
    formError.value = "请先选择团期。"
    return
  }
  loading.value = true
  error.value = ""
  formError.value = ""
  try {
    list.value = await getTravelers(tourSessionId, buildQuery())
  } catch (caught) {
    error.value = readableRosterError(caught)
  } finally {
    loading.value = false
  }
}

async function exportFile(): Promise<void> {
  const tourSessionId = filters.tourSessionId.trim()
  if (tourSessionId.length === 0) {
    formError.value = "请先选择团期。"
    return
  }
  exporting.value = true
  formError.value = ""
  try {
    await downloadTravelersExport(tourSessionId, buildQuery())
  } catch (caught) {
    formError.value = readableRosterError(caught)
  } finally {
    exporting.value = false
  }
}

function openConfirm(row: TravelerRow): void {
  confirming.value = row
  confirmReason.value = row.eligibilityReason ?? ""
  confirmError.value = ""
}

function closeConfirm(): void {
  confirming.value = null
  confirmReason.value = ""
  confirmError.value = ""
}

async function saveConfirmation(): Promise<void> {
  if (confirming.value === null || list.value === undefined || confirming.value.importVersion === null) return
  const importRef = confirming.value.sourceRefs.find(ref => ref.startsWith("imported:"))
  if (importRef === undefined) return
  savingConfirmation.value = true
  confirmError.value = ""
  try {
    list.value = await confirmTravelerEligibility(importRef.slice("imported:".length), {
      expectedVersion: confirming.value.importVersion,
      expectedRosterVersion: list.value.rosterVersion,
      reason: confirmReason.value,
    })
    closeConfirm()
  } catch (caught) {
    confirmError.value = readableRosterError(caught)
  } finally {
    savingConfirmation.value = false
  }
}

async function loadPermission(): Promise<void> {
  await loadOptions()
  try {
    const staff = await getCurrentStaff()
    canCorrect.value = staff.permissionKeys.includes("roster.correct")
  } catch {
    canCorrect.value = false
  }
}

function buildQuery(): { readonly classId?: string; readonly includeInactive?: boolean; readonly source?: TravelerSource; readonly search?: string } {
  return {
    ...(filters.classId.trim().length === 0 ? {} : { classId: filters.classId.trim() }),
    ...(includeInactive.value ? { includeInactive: true } : {}),
    ...(sourceFilter.value === "" ? {} : { source: sourceFilter.value }),
    ...(search.value.trim().length === 0 ? {} : { search: search.value.trim() }),
  }
}

function clearResults(): void {
  list.value = undefined
  error.value = ""
  formError.value = ""
  closeConfirm()
}

function sourceLabel(row: TravelerRow): string {
  return row.source === "paid" ? "已付款" : row.importedRole === "teacher" ? "导入教师" : "导入名单"
}

function eligibilityLabel(row: TravelerRow): string {
  if (!row.active) return "无效"
  if (row.eligibility === "paid") return "已付款"
  if (row.eligibility === "teacher") return "教师非付费"
  if (row.eligibility === "confirmed") return "人工确认"
  return "待确认"
}

function conflictLabel(code: TravelerConflictCode | null): string {
  if (code === "identity_fields_conflict") return "身份字段冲突"
  if (code === "duplicate_paid_sources") return "重复付款来源"
  if (code === "eligibility_conflict") return "资格冲突"
  return "无"
}
</script>
