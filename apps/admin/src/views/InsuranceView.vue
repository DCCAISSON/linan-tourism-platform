<template>
  <section class="insurance-page" aria-labelledby="insurance-title">
    <header class="insurance-heading">
      <div>
        <p class="insurance-heading__eyebrow">保险工作台</p>
        <h2 id="insurance-title">投保名单与人工交接</h2>
      </div>
      <p>导出仅用于交接，不代表保险公司已承保；人工成功必须登记回执依据。</p>
    </header>

    <form class="insurance-filter" @submit.prevent="loadWorkspace">
      <fieldset :disabled="loading || working">
        <legend>选择团期</legend>
        <label>团期
          <select v-model="tourSessionId" required>
            <option value="">请选择团期</option>
            <option v-for="session in sessions" :key="session.id" :value="session.id">{{ session.code }}</option>
          </select>
        </label>
        <label>保险公司模板
          <input v-model="companyTemplateName" type="text" placeholder="未确认时留空，只导出准备表">
        </label>
        <div class="insurance-actions">
          <button type="submit" :disabled="tourSessionId === ''">{{ loading ? "读取中..." : "读取名单" }}</button>
          <button type="button" :disabled="createDisabled" @click="createBatch">生成保险批次</button>
        </div>
      </fieldset>
      <p v-if="message" class="insurance-state">{{ message }}</p>
      <p v-if="error" class="insurance-state insurance-state--error" role="alert">{{ error }}</p>
    </form>

    <section class="insurance-summary" aria-label="保险名单预览">
      <article><span>当前名单版本</span><strong>{{ preview?.rosterVersion ?? "待读取" }}</strong></article>
      <article><span>有效人数</span><strong>{{ preview?.activeCount ?? 0 }} 人</strong></article>
      <article><span>缺证/冲突</span><strong>{{ preview ? `${preview.missingIdentityCount}/${preview.conflictCount}` : "待读取" }}</strong></article>
      <article><span>批次状态</span><strong>{{ batch ? statusText(batch.status) : "未建批" }}</strong></article>
    </section>

    <section class="insurance-card" aria-labelledby="insurance-actions-title">
      <h3 id="insurance-actions-title">交接操作</h3>
      <div class="insurance-action-grid">
        <label>导出类型
          <select v-model="exportKind">
            <option value="preparation">基础准备表</option>
            <option value="company_template">保险公司正式模板</option>
          </select>
        </label>
        <label class="insurance-check"><input v-model="sensitiveExport" type="checkbox"> 导出完整证件原文</label>
        <button type="button" :disabled="batch === null || working" @click="downloadExport">导出名单</button>
        <button type="button" :disabled="submitDisabled" @click="submitBatch">登记送交</button>
        <button type="button" :disabled="batch === null || working" @click="loadDiff">检测差异</button>
      </div>
      <div class="insurance-action-grid">
        <label>送交/结果回执
          <input v-model="receiptReference" type="text" placeholder="回执编号、邮件或附件引用">
        </label>
        <label>保单号
          <input v-model="policyNumber" type="text" placeholder="人工成功时必填">
        </label>
        <label>起保日期
          <input v-model="coverageStart" type="date">
        </label>
        <label>止保日期
          <input v-model="coverageEnd" type="date">
        </label>
      </div>
      <label class="insurance-note">备注
        <textarea v-model="note" rows="3" placeholder="说明交接对象、失败原因或变更退保处理依据"></textarea>
      </label>
      <div class="insurance-actions">
        <button type="button" :disabled="resultDisabled" @click="recordResult(true)">登记人工成功</button>
        <button type="button" :disabled="resultDisabled" @click="recordResult(false)">登记人工失败</button>
        <button type="button" :disabled="changeDisabled" @click="createChange('policy_change')">新增变更交接</button>
        <button type="button" :disabled="changeDisabled" @click="createChange('cancellation_change')">新增退保交接</button>
      </div>
    </section>

    <section v-if="diff" class="insurance-card" aria-labelledby="insurance-diff-title">
      <h3 id="insurance-diff-title">名单差异</h3>
      <p>{{ diff.rosterChanged ? "名单已变化，需要人工处理变更或退保交接。" : "名单暂无差异。" }}</p>
      <p>新增 {{ diff.addedRefs.length }}，移除 {{ diff.removedRefs.length }}，资料变化 {{ diff.changedRefs.length }}。</p>
    </section>

    <section class="insurance-card" aria-labelledby="insurance-table-title">
      <h3 id="insurance-table-title">批次人员</h3>
      <p v-if="batch === null" class="insurance-state">请选择团期后读取或生成保险批次。</p>
      <div v-else class="insurance-table-wrap">
        <table class="insurance-table" aria-label="保险批次人员表">
          <thead><tr><th>姓名</th><th>班级</th><th>证件</th><th>手机号</th><th>状态</th><th>问题</th><th>保单号</th></tr></thead>
          <tbody>
            <tr v-for="person in batch.people" :key="person.id">
              <td>{{ person.displayName }}</td>
              <td>{{ person.className ?? "-" }}</td>
              <td>{{ person.identityMasked ?? "缺证" }}</td>
              <td>{{ person.phoneMasked ?? "-" }}</td>
              <td>{{ personStatusText(person.status) }}</td>
              <td>{{ issueText(person.issueCode) }}</td>
              <td>{{ person.policyNumber ?? "-" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="insurance-card" aria-labelledby="insurance-handoff-title">
      <h3 id="insurance-handoff-title">人工交接记录</h3>
      <p v-if="batch === null || batch.handoffs.length === 0" class="insurance-state">暂无交接记录。</p>
      <ol v-else class="insurance-handoff-list">
        <li v-for="handoff in batch.handoffs" :key="handoff.id"><strong>{{ handoffText(handoff.kind) }}</strong><span>{{ handoff.note }}</span><small>{{ handoff.receiptReference ?? "无回执引用" }}</small></li>
      </ol>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import { useSessionQuery } from "@/layouts/useSessionQuery"
import { getCurrentStaff } from "@/api/auth"
import { listTourSessions } from "@/api/configuration"
import type { TourSession } from "@/api/configuration"
import { createInsuranceBatch, createInsuranceChangeHandoff, downloadInsuranceExport, getInsuranceDiff, getInsurancePreview, getLatestInsuranceBatch, readableInsuranceError, recordInsuranceResult, submitInsuranceBatch } from "@/api/insurance"
import type { InsuranceBatch, InsuranceDiff, InsuranceExportKind, InsurancePreview } from "@/api/insurance"
import "@/styles/insurance.css"

const sessions = ref<readonly TourSession[]>([])
const tourSessionId = ref("")
const sessionQuery = useSessionQuery(tourSessionId, id => sessions.value.some(row => row.id === id), () => loading.value || working.value)
const companyTemplateName = ref("")
const preview = ref<InsurancePreview | null>(null)
const batch = ref<InsuranceBatch | null>(null)
const diff = ref<InsuranceDiff | null>(null)
const exportKind = ref<InsuranceExportKind>("preparation")
const sensitiveExport = ref(false)
const receiptReference = ref("")
const policyNumber = ref("")
const coverageStart = ref("")
const coverageEnd = ref("")
const note = ref("")
const loading = ref(false)
const working = ref(false)
const error = ref("")
const message = ref("")
const canWrite = ref(false)

const createDisabled = computed(() => preview.value === null || working.value || !canWrite.value)
const submitDisabled = computed(() => batch.value === null || preview.value === null || working.value || !canWrite.value || receiptReference.value.trim() === "" || note.value.trim() === "")
const resultDisabled = computed(() => batch.value === null || working.value || !canWrite.value || note.value.trim() === "")
const changeDisabled = computed(() => batch.value === null || diff.value?.rosterChanged !== true || working.value || note.value.trim() === "" || !canWrite.value)

onMounted(async () => {
  try {
    const [rows, staff] = await Promise.all([listTourSessions(), getCurrentStaff()])
    sessions.value = rows.filter(row => staff.scopes.some(scope => scope.kind === "all" || scope.kind === "tour_session" && scope.id === row.id || (scope.kind === "school" || scope.kind === "organization") && scope.id === row.organizationId))
    canWrite.value = staff.permissionKeys.includes("insurance.write")
    sessionQuery.initialize()
  } catch (caught) { error.value = readableInsuranceError(caught) }
})
watch(tourSessionId, () => {
  preview.value = null; batch.value = null; diff.value = null; message.value = ""; error.value = ""
  companyTemplateName.value = ""; receiptReference.value = ""; policyNumber.value = ""; coverageStart.value = ""; coverageEnd.value = ""; note.value = ""; sensitiveExport.value = false
}, { flush: "sync" })

async function loadWorkspace(): Promise<void> {
  if (tourSessionId.value === "") return
  const id = tourSessionId.value
  const revision = sessionQuery.revision.value
  loading.value = true
  error.value = ""
  message.value = ""
  diff.value = null
  try {
    const [loadedPreview, loadedBatch] = await Promise.all([getInsurancePreview(id), getLatestInsuranceBatch(id)])
    if (revision !== sessionQuery.revision.value) return
    preview.value = loadedPreview; batch.value = loadedBatch
  } catch (caught) { if (revision === sessionQuery.revision.value) error.value = readableInsuranceError(caught) }
  finally { loading.value = false }
}

async function createBatch(): Promise<void> {
  const currentPreview = preview.value
  if (currentPreview === null) return
  await runWork(async () => {
    batch.value = await createInsuranceBatch({ tourSessionId: currentPreview.tourSessionId, expectedRosterVersion: currentPreview.rosterVersion, companyTemplateName: blankToNull(companyTemplateName.value) })
    message.value = "保险批次已生成，缺证或冲突会阻止送交。"
  })
}

async function submitBatch(): Promise<void> {
  const currentBatch = batch.value
  const currentPreview = preview.value
  if (currentBatch === null || currentPreview === null) return
  await runWork(async () => {
    batch.value = await submitInsuranceBatch(currentBatch.id, { expectedRosterVersion: currentPreview.rosterVersion, receiptReference: receiptReference.value.trim(), note: note.value.trim() })
    message.value = "已记录送交；这不代表保险公司已承保。"
  })
}

async function recordResult(success: boolean): Promise<void> {
  const currentBatch = batch.value
  if (currentBatch === null) return
  await runWork(async () => {
    batch.value = await recordInsuranceResult(currentBatch.id, { success, receiptReference: blankToNull(receiptReference.value), policyNumber: blankToNull(policyNumber.value), coverageStart: blankToNull(coverageStart.value), coverageEnd: blankToNull(coverageEnd.value), note: note.value.trim() })
    message.value = success ? "已按回执登记人工投保成功。" : "已登记人工投保失败。"
  })
}

async function loadDiff(): Promise<void> {
  const currentBatch = batch.value
  if (currentBatch === null) return
  await runWork(async () => { diff.value = await getInsuranceDiff(currentBatch.id) })
}

async function createChange(kind: "policy_change" | "cancellation_change"): Promise<void> {
  const currentBatch = batch.value
  if (currentBatch === null) return
  await runWork(async () => {
    batch.value = await createInsuranceChangeHandoff(currentBatch.id, { kind, note: note.value.trim(), receiptReference: blankToNull(receiptReference.value) })
    message.value = kind === "policy_change" ? "已登记变更交接。" : "已登记退保交接，未自动退保成功。"
  })
}

async function downloadExport(): Promise<void> {
  const currentBatch = batch.value
  if (currentBatch === null) return
  await runWork(async () => {
    await downloadInsuranceExport(currentBatch.id, exportKind.value, sensitiveExport.value)
    message.value = "名单已导出；导出不改变承保状态。"
  })
}

async function runWork(action: () => Promise<void>): Promise<void> {
  working.value = true
  error.value = ""
  try { await action() }
  catch (caught) { error.value = readableInsuranceError(caught) }
  finally { working.value = false }
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

function statusText(status: InsuranceBatch["status"]): string {
  return ({ draft: "待送交", blocked: "缺证或冲突", submitted: "已送交", insured: "已承保", failed: "投保失败", change_pending: "待处理变更" })[status]
}
function personStatusText(status: string): string {
  return ({ ready: "可送交", blocked: "阻止送交", submitted: "已送交", insured: "已承保", failed: "失败", cancellation_requested: "退保交接中" })[status] ?? status
}
function issueText(issue: string | null): string {
  if (issue === "missing_identity") return "缺少证件"
  if (issue === "traveler_conflict") return "名单冲突"
  return "-"
}
function handoffText(kind: string): string {
  return ({ submitted: "送交", manual_success: "人工成功", manual_failure: "人工失败", policy_change: "变更交接", cancellation_change: "退保交接" })[kind] ?? kind
}
</script>
