<script setup lang="ts">
import { onMounted, ref } from "vue"
import { getCurrentStaff } from "@/api/auth"
import { loadDateStatistics, type DateStatistics } from "@/api/date-statistics"
import { readableRosterError } from "@/api/roster.errors"
import { formatFen } from "./format"
defineProps<{ readonly schools: readonly { readonly id: string; readonly name: string }[] }>()
const allowed = ref(false), busy = ref(false)
const from = ref(""), until = ref(""), schoolId = ref(""), error = ref("")
const result = ref<DateStatistics>()
onMounted(async () => {
  try {
    const staff = await getCurrentStaff()
    allowed.value = staff.scopes.some(scope => scope.kind === "all") && staff.permissionKeys.includes("roster.read") && staff.permissionKeys.includes("execution.read") && (staff.permissionKeys.includes("orders.read") || staff.permissionKeys.includes("workbench.read"))
  } catch (cause) { error.value = readableRosterError(cause) }
})
async function query(): Promise<void> {
  error.value = ""; result.value = undefined
  if (!from.value || !until.value || from.value > until.value) { error.value = "请选择有效的起止日期。"; return }
  busy.value = true
  try { result.value = await loadDateStatistics(from.value, until.value, schoolId.value) }
  catch (cause) { error.value = readableRosterError(cause) }
  finally { busy.value = false }
}
function departureDate(value: string): string { return new Date(value).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" }) }
function clearResult(): void { result.value = undefined; error.value = "" }
</script>
<template>
  <section v-if="allowed" class="roster-import-card date-statistics" aria-labelledby="date-statistics-title">
    <h3 id="date-statistics-title">按出行日期汇总</h3>
    <p>按团期出发日期筛选，包含起止两天（北京时间）。金额为这些团期截至查询时的累计支付与成功退款，不是日期区间内的资金流水。</p>
    <form @submit.prevent="query">
      <fieldset :disabled="busy" class="date-statistics-fields">
        <label class="field">开始日期<input v-model="from" type="date" required @change="clearResult"></label>
        <label class="field">结束日期<input v-model="until" type="date" required :min="from" @change="clearResult"></label>
        <label class="field">学校<select v-model="schoolId" @change="clearResult"><option value="">全部学校</option><option v-for="school in schools" :key="school.id" :value="school.id">{{ school.name }}</option></select></label>
        <button type="submit">{{ busy ? '正在查询…' : '查询日期汇总' }}</button>
      </fieldset>
    </form>
    <p v-if="error" class="roster-state roster-state--error" role="alert">{{ error }}</p>
    <template v-if="result">
      <p role="status">共 {{ result.rows.length }} 个团期；未确认名单 {{ result.totals.confirmationMissing }} 个，未完成点名 {{ result.totals.attendanceIncomplete }} 个。已点名人数不代表全部实际出行人数。</p>
      <div class="roster-stat-grid">
        <article class="roster-stat-card"><span>已支付报名人数</span><strong>{{ result.totals.paidHeadcount }} 人</strong></article>
        <article class="roster-stat-card"><span>累计支付金额</span><strong>{{ formatFen(result.totals.paymentAmountFen) }}</strong></article>
        <article class="roster-stat-card"><span>成功退款金额</span><strong>{{ formatFen(result.totals.refundAmountFen) }}</strong></article>
        <article class="roster-stat-card"><span>已点名实到人数</span><strong>{{ result.totals.presentHeadcount }} 人</strong></article>
      </div>
      <p class="roster-state">累计支付保留已退款订单的原支付金额，不扣减退款；成功退款只计已完成的退款，不含处理中或失败的退款。</p>
      <p class="roster-state">报名人数沿用已付款且未取消名单；实到按当前确认名单的到场记录计数。无点名记录不视为已核实的零人出行。</p>
      <p v-if="result.rows.length === 0" class="roster-state">当前日期和学校下没有团期，请调整出发日期或学校后重新查询。</p>
      <div v-else class="roster-table-wrap"><table class="roster-table" aria-label="日期区间团期统计"><thead><tr><th>团期 / 学校</th><th>出发日期</th><th>已支付报名</th><th>累计支付</th><th>成功退款</th><th>已点名实到</th></tr></thead><tbody><tr v-for="row in result.rows" :key="row.sessionId"><td data-label="团期 / 学校">{{ row.code }} / {{ row.schoolName }}</td><td data-label="出发日期">{{ departureDate(row.startsAt) }}</td><td data-label="已支付报名">{{ row.paidHeadcount }} 人</td><td data-label="累计支付">{{ formatFen(row.paymentAmountFen) }}</td><td data-label="成功退款">{{ formatFen(row.refundAmountFen) }}</td><td data-label="已点名实到">{{ row.confirmationMissing ? '名单未确认' : `${row.presentHeadcount} 人${row.attendanceIncomplete ? '（点名未完成）' : ''}` }}</td></tr></tbody></table></div>
    </template>
  </section>
</template>
<style scoped>
.date-statistics-fields { display: flex; flex-wrap: wrap; align-items: end; gap: var(--space-4); padding: 0; border: 0; }
.date-statistics-fields .field { flex: 1 1 180px; min-width: 0; }
.date-statistics-fields input, .date-statistics-fields select { box-sizing: border-box; width: 100%; min-height: var(--size-touch-target); }
.date-statistics-fields button { min-height: var(--size-touch-target); padding: var(--space-2) var(--space-4); border: 0; border-radius: var(--radius-control); background: var(--accent-primary); color: var(--on-accent); }
</style>
