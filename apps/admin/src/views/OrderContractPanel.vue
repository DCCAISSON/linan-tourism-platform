<template>
  <section class="order-contract" aria-labelledby="order-contract-title">
    <div class="orders-section-heading"><h3 id="order-contract-title">报名合同与签字</h3><button type="button" class="orders-link" @click="opened ? close() : load()">{{ opened ? '收起合同' : '查看合同与签字' }}</button></div>
    <template v-if="opened">
      <p v-if="loading" role="status">正在读取订单合同...</p>
      <p v-if="errorMessage" class="orders-error" role="alert">{{ errorMessage }} <button type="button" @click="load">重试</button></p>
      <p v-else-if="!loading && !contract" class="orders-state">此订单没有合同记录。</p>
      <article v-if="contract" aria-label="订单合同快照">
        <p class="contract-status">{{ contract.status === 'pending_parent_signature' ? '待家长签字' : '家长已签字，待旅行社处理' }}</p>
        <p class="contract-scope">{{ contract.scopeStatement }}</p>
        <dl class="orders-facts">
          <div><dt>订单号</dt><dd>{{ contract.order.code }}</dd></div><div><dt>合同版本</dt><dd>{{ contract.template.title }} · {{ contract.template.version }}</dd></div>
          <div><dt>出行日期（北京时间）</dt><dd>{{ formatDate(contract.order.startsAt) }} 至 {{ formatDate(contract.order.endsAt) }}</dd></div><div><dt>订单费用</dt><dd>{{ formatFen(contract.order.amountFen) }}</dd></div>
          <div><dt>报名付款人</dt><dd>{{ contract.order.payerName }}</dd></div><div><dt>签字人</dt><dd>{{ contract.signerName ?? '尚未签字' }}</dd></div>
          <div><dt>签字时间（北京时间）</dt><dd>{{ contract.signedAt ? formatDate(contract.signedAt) : '尚未签字' }}</dd></div>
        </dl>
        <h4>报名时参加人员</h4><ul class="contract-people"><li v-for="(person, index) in contract.participants" :key="index">{{ person.name }} · {{ person.kind === 'student' ? '学生' : '成人' }}<span v-if="person.identityMasked"> · {{ person.identityMasked }}</span> · {{ formatFen(person.amountFen) }}</li></ul>
        <template v-if="contract.signature"><h4>手写签字</h4><svg class="contract-signature" role="img" :aria-label="`${contract.signerName ?? '家长'}的手写签字`" :viewBox="`0 0 ${contract.signature.width} ${contract.signature.height}`"><polyline v-for="(stroke, index) in contract.signature.strokes" :key="index" :points="stroke.map(point => `${point.x},${point.y}`).join(' ')" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg></template>
        <h4>报名时合同全文</h4><pre class="contract-body">{{ contract.template.bodyText }}</pre>
        <details class="contract-hashes"><summary>原件及合同校验值</summary><p>原件：{{ contract.template.sourceFilename }}</p><p>原件 SHA-256：{{ contract.template.sourceSha256 }}</p><p>正文 SHA-256：{{ contract.template.bodySha256 }}</p><p>订单快照 SHA-256：{{ contract.snapshotHash }}</p></details>
      </article>
    </template>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue"
import { getOrderContract, readableContractError, type OrderContract } from "@/api/contracts"
import { formatFen } from "@/views/roster/format"

const props = defineProps<{ readonly orderId: string }>()
const contract = ref<OrderContract | null>(null)
const opened = ref(false)
const loading = ref(false)
const errorMessage = ref("")
let requestId = 0
watch(() => props.orderId, close)
onBeforeUnmount(close)
function close(): void { requestId += 1; opened.value = false; loading.value = false; contract.value = null; errorMessage.value = "" }
async function load(): Promise<void> {
  const current = ++requestId
  opened.value = true; loading.value = true; contract.value = null; errorMessage.value = ""
  try { const result = await getOrderContract(props.orderId); if (current === requestId) contract.value = result }
  catch (error) { if (current === requestId) errorMessage.value = readableContractError(error) }
  finally { if (current === requestId) loading.value = false }
}
function formatDate(value: string): string { return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) }
</script>

<style scoped>
.order-contract { margin: var(--space-6) 0; padding: var(--space-4); border-radius: var(--radius-control); background: var(--surface-primary); }
.order-contract .orders-section-heading { flex-wrap: wrap; }
.contract-status { color: var(--status-warning); font-size: var(--font-body); }
.contract-scope, .contract-people, .contract-hashes { color: var(--text-secondary); font-size: var(--font-body-sm); overflow-wrap: anywhere; }
.contract-people { padding-left: var(--space-5); line-height: 1.8; }
.contract-signature { display: block; width: 100%; max-width: calc(var(--space-10) * 8); max-height: calc(var(--space-10) * 4); border: 1px solid var(--border-default); border-radius: var(--radius-control); color: var(--text-primary); background: var(--surface-elevated); }
.contract-body { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; font-size: var(--font-body-sm); line-height: 1.8; }
.order-contract h4 { font-size: var(--font-body); }
</style>
