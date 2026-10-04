<template>
  <section class="workbench" aria-labelledby="payment-reconciliation-title" :aria-busy="loading">
    <header class="workbench-heading">
      <div>
        <h2 id="payment-reconciliation-title">微信支付对账</h2>
        <p>下载微信交易账单并比对平台支付和退款记录。这里只记录差异，不自动修改订单或退款。</p>
      </div>
      <button type="button" :disabled="loading || billDate.length === 0" @click="runReconcile">{{ loading ? "对账中..." : "执行对账" }}</button>
    </header>

    <section class="workbench-card" aria-labelledby="reconcile-form-title">
      <h3 id="reconcile-form-title">账单日期</h3>
      <label class="reconciliation-form"><span>日期</span><input v-model="billDate" type="date" /></label>
      <p class="workbench-caption">商户模式和资金接口未确认时，服务端会拒绝下载账单。</p>
    </section>

    <p v-if="error" class="workbench-state workbench-state--error" role="alert">{{ error }}</p>
    <p v-if="loading" class="workbench-state" role="status">正在处理微信账单...</p>

    <section v-if="result" class="workbench-card" aria-labelledby="reconcile-result-title">
      <div class="workbench-card-heading"><h3 id="reconcile-result-title">对账结果</h3><span>{{ result.differenceCount }} 条差异</span></div>
      <p class="workbench-caption">账单日期：{{ result.billDate }}；内容 SHA-256：{{ result.contentHash }}</p>
      <p class="workbench-caption">确认说明：{{ result.confirmedNote ?? "尚未确认" }}</p>
      <div class="reconciliation-confirm">
        <input v-model="note" type="text" maxlength="500" placeholder="填写人工确认说明" />
        <button type="button" :disabled="loading || note.length === 0" @click="confirm">保存确认</button>
      </div>
      <div class="workbench-table-wrap">
        <table class="workbench-table" aria-label="微信支付对账差异">
          <thead><tr><th scope="col">类型</th><th scope="col">商户单号</th><th scope="col">商户退款单号</th><th scope="col">微信金额</th><th scope="col">平台金额</th><th scope="col">微信退款金额</th><th scope="col">平台退款金额</th><th scope="col">说明</th></tr></thead>
          <tbody>
            <tr v-for="difference in visibleDifferences" :key="`${difference.kind}:${difference.outTradeNo}:${difference.outRefundNo ?? ''}`">
              <td data-label="类型">{{ differenceKindLabel[difference.kind] }}</td>
              <td data-label="商户单号">{{ difference.outTradeNo }}</td>
              <td data-label="商户退款单号">{{ difference.outRefundNo ?? "-" }}</td>
              <td data-label="微信金额">{{ formatNullableFen(difference.wechatAmountFen) }}</td>
              <td data-label="平台金额">{{ formatNullableFen(difference.localAmountFen) }}</td>
              <td data-label="微信退款金额">{{ formatNullableFen(difference.wechatRefundFen) }}</td>
              <td data-label="平台退款金额">{{ formatNullableFen(difference.localRefundFen) }}</td>
              <td data-label="说明">{{ difference.summary }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="visibleDifferences.length === 0" class="workbench-state">没有需要人工处理的差异。</p>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import { confirmWechatReconciliation, reconcileWechatBill, type BillDifference, type PaymentReconciliation } from "@/api/payments"
import { formatFen } from "@/views/roster/format"
import { readableRosterError } from "@/api/roster"
import "@/styles/workbench.css"

const billDate = ref(new Date().toISOString().slice(0, 10))
const loading = ref(false)
const error = ref("")
const note = ref("")
const result = ref<PaymentReconciliation>()
const differenceKindLabel = { wechat_only: "微信有，平台无", local_only: "平台有，微信无", amount_mismatch: "金额不一致", refund_mismatch: "退款不一致", matched: "一致" } as const satisfies Record<BillDifference["kind"], string>
const visibleDifferences = computed(() => result.value?.differences.filter((difference) => difference.kind !== "matched") ?? [])

async function runReconcile(): Promise<void> {
  loading.value = true
  error.value = ""
  try { result.value = await reconcileWechatBill(billDate.value) }
  catch (cause) { error.value = readableRosterError(cause) }
  finally { loading.value = false }
}
async function confirm(): Promise<void> {
  if (result.value === undefined) return
  loading.value = true
  error.value = ""
  try { result.value = await confirmWechatReconciliation(result.value.billDate, note.value); note.value = "" }
  catch (cause) { error.value = readableRosterError(cause) }
  finally { loading.value = false }
}
function formatNullableFen(value: number | null): string { return value === null ? "-" : formatFen(value) }
</script>

<style scoped>
.workbench-caption { overflow-wrap: anywhere; }
.workbench-table td:first-child { white-space: nowrap; }
.reconciliation-form,
.reconciliation-confirm { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.reconciliation-form input,
.reconciliation-confirm input { min-height: 40px; border: 1px solid var(--border-default); border-radius: 8px; padding: 0 12px; color: var(--text-primary); }
.reconciliation-confirm input { min-width: min(420px, 100%); }
</style>
