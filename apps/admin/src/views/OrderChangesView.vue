<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue"
import { getCurrentStaff } from "@/api/auth"
import { addOrderChangeNote, listOrderChanges, orderChangeStatusLabels, reviewOrderChange, type OrderChangeDecision, type OrderChangeRequest, type OrderChangeStatus } from "@/api/order-changes"

const requests = ref<readonly OrderChangeRequest[]>([])
const status = ref<OrderChangeStatus | "">("")
const notes = reactive<Record<string, string>>({})
const loading = ref(false)
const busyId = ref("")
const error = ref("")
const notice = ref("")
const canManage = ref(false)
const filtered = computed(() => requests.value.filter((row) => status.value === "" || row.status === status.value))
const statusOptions = Object.entries(orderChangeStatusLabels)

onMounted(async () => {
  try {
    const staff = await getCurrentStaff()
    canManage.value = staff.permissionKeys.includes("orders.read") && staff.permissionKeys.includes("roster.correct")
    await load()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : "无法读取当前账号，请重新登录" }
})

async function load(): Promise<void> {
  loading.value = true; error.value = ""
  try { requests.value = await listOrderChanges() }
  catch (cause) { error.value = cause instanceof Error ? cause.message : "申请加载失败，请重试" }
  finally { loading.value = false }
}

async function process(item: OrderChangeRequest, decision: OrderChangeDecision | "note"): Promise<void> {
  const note = notes[item.id]?.trim() ?? ""
  if (!canManage.value || busyId.value !== "" || note === "") return
  busyId.value = item.id; error.value = ""; notice.value = ""
  try {
    const updated = decision === "note" ? await addOrderChangeNote(item.id, item.version, note) : await reviewOrderChange(item.id, item.version, decision, note)
    requests.value = requests.value.map((row) => row.id === updated.id ? updated : row)
    notes[item.id] = ""; status.value = ""
    notice.value = decision === "approved" ? "已记录审核通过，仍待实际处理；正式名单、金额、分车和保险保持不变。" : decision === "note" ? "处理说明已记录；申请仍为审核通过、待实际处理。" : "处理意见已记录，申请人可在订单中查看。"
  } catch (cause) { error.value = cause instanceof Error ? cause.message : "处理失败，请刷新后重试" }
  finally { busyId.value = "" }
}

function originalName(item: OrderChangeRequest): string { return item.originalSnapshot.lines.find((line) => line.id === item.originalLineId)?.displayName ?? "" }
function formatDate(value: string): string { return new Date(value).toLocaleString("zh-CN", { hour12: false }) }
function money(value: number): string { return `¥${(value / 100).toFixed(2)}` }
</script>

<template>
  <main class="orders-page order-changes">
    <section class="orders-card">
      <div class="orders-heading"><div><h1>人员变更申请</h1><p>查看已付款订单的换人、增补申请，记录审核意见及后续处理说明。</p></div><button class="orders-button orders-button--secondary" :disabled="loading || busyId !== ''" @click="load">刷新申请</button></div>
      <p class="change-boundary">审核通过仅代表申请已获同意。正式名单、金额、分车和保险须在业务规则确认并实际处理后变更，本页不会自动修改。</p>
      <label class="orders-field">申请状态<select v-model="status"><option value="">全部状态</option><option v-for="[value, label] in statusOptions" :key="value" :value="value">{{ label }}</option></select></label>
      <p v-if="notice" class="orders-state" role="status">{{ notice }}</p>
      <p v-if="error" class="orders-error" role="alert">{{ error }}</p>
      <p v-if="loading" class="orders-state" role="status">正在读取申请…</p>
      <p v-else-if="filtered.length === 0" class="orders-state">当前没有符合条件的人员变更申请。</p>
    </section>
    <article v-for="item in filtered" :key="item.id" class="orders-card change-request">
      <div class="orders-heading"><h2>{{ item.kind === 'replacement' ? '换人' : '增补人员' }} · {{ item.proposedParticipant.displayName }}</h2><span class="orders-status">{{ orderChangeStatusLabels[item.status] }}</span></div>
      <dl class="orders-facts change-facts">
        <div><dt>订单号</dt><dd>{{ item.orderCode }}</dd></div><div><dt>学校</dt><dd>{{ item.proposedParticipant.schoolName }}</dd></div><div><dt>申请时间</dt><dd>{{ formatDate(item.createdAt) }}</dd></div>
        <div v-if="item.kind === 'replacement'"><dt>原参加人</dt><dd>{{ originalName(item) }}</dd></div><div><dt>拟参加人</dt><dd>{{ item.proposedParticipant.displayName }} · {{ item.proposedParticipant.participantKind === 'student' ? '学生' : '成人' }}</dd></div><div><dt>原订单已付金额</dt><dd class="orders-money">{{ money(item.originalSnapshot.paidFen) }}（保持不变）</dd></div>
        <div><dt>拟参加人证件</dt><dd>{{ item.proposedParticipant.identityNumberMasked }}</dd></div><div><dt>拟参加人手机号</dt><dd>{{ item.proposedParticipant.phoneMasked }}</dd></div><div v-if="item.proposedParticipant.gradeName"><dt>年级 / 班级</dt><dd>{{ item.proposedParticipant.gradeName }} / {{ item.proposedParticipant.className }}</dd></div>
      </dl>
      <p class="change-reason"><strong>申请原因：</strong>{{ item.reason }}</p>
      <p v-if="item.refundConflict" class="orders-error">{{ item.kind === 'addition' ? '本订单有退款正在处理，退款结束后方可审核通过增补申请。' : '原参加人有退款正在处理，退款结束后方可审核通过换人申请。' }}</p>
      <details class="change-records"><summary>查看处理记录（{{ item.history.length }} 条）</summary><ol><li v-for="entry in item.history" :key="entry.version"><p>{{ formatDate(entry.at) }} · {{ entry.actorName }} · {{ orderChangeStatusLabels[entry.status] }}</p><p>{{ entry.note }}</p></li></ol></details>
      <div v-if="canManage && (item.status === 'submitted' || item.status === 'needs_information' || item.status === 'approved')" class="change-processing">
        <label class="orders-field" :for="`change-note-${item.id}`">{{ item.status === 'approved' ? '后续处理说明（只留痕，不自动变更）' : '处理意见（必填）' }}<textarea :id="`change-note-${item.id}`" v-model="notes[item.id]" maxlength="1000" :disabled="busyId !== ''" :placeholder="item.status === 'approved' ? '填写联系、费用或保险核对情况，不代表实际处理完成' : '说明审核依据、需补材料或驳回原因'" /></label>
        <div class="orders-refund-actions">
          <template v-if="item.status !== 'approved'">
            <button class="orders-button" :disabled="busyId !== '' || !notes[item.id]?.trim() || item.refundConflict" @click="process(item, 'approved')">审核通过，待实际处理</button>
            <button class="orders-button orders-button--secondary" :disabled="busyId !== '' || !notes[item.id]?.trim()" @click="process(item, 'needs_information')">请申请人补充材料</button>
            <button class="orders-button orders-button--secondary" :disabled="busyId !== '' || !notes[item.id]?.trim()" @click="process(item, 'rejected')">驳回申请</button>
          </template>
          <button v-else class="orders-button" :disabled="busyId !== '' || !notes[item.id]?.trim()" @click="process(item, 'note')">保存处理说明</button>
        </div>
      </div>
      <p v-else-if="!canManage" class="orders-state">当前账号仅可查看，审核与处理由具备人员更正权限的工作人员办理。</p>
    </article>
  </main>
</template>

<style scoped>
.change-boundary { margin: var(--space-4) 0; padding: var(--space-4); border-radius: var(--radius-control); background: var(--surface-secondary); color: var(--text-secondary); line-height: 1.6; }
.change-facts { margin-top: var(--space-5); margin-bottom: var(--space-4); }
.change-reason { overflow-wrap: anywhere; line-height: 1.6; }
.change-records { margin-top: var(--space-4); color: var(--text-secondary); font-size: var(--font-body-sm); }
.change-records summary { min-height: var(--size-touch-target); line-height: var(--size-touch-target); color: var(--accent-primary); cursor: pointer; }
.change-records li { padding: var(--space-2) 0; border-bottom: 1px solid var(--border-subtle); overflow-wrap: anywhere; }
.change-processing { display: grid; gap: var(--space-3); margin-top: var(--space-4); }
.change-processing textarea { box-sizing: border-box; width: 100%; min-height: calc(var(--size-touch-target) * 2); padding: var(--space-3); border: 1px solid var(--border-default); border-radius: var(--radius-control); background: var(--surface-primary); color: var(--text-primary); font: inherit; resize: vertical; }
.change-processing textarea:focus-visible, .change-records summary:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
</style>
