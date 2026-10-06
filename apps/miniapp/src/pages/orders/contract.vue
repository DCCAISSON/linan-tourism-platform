<script setup lang="ts">
import { computed, ref, watch } from "vue"
import DiscoveryState from "../../components/DiscoveryState.vue"
import ContractSignaturePad from "../../components/ContractSignaturePad.vue"
import { formatDateLabel, formatFen } from "../../enrollment-flow"
import { useContractPage } from "./useContractPage"
const { contract, state, error, signerName, agreed, signature, submitting, signed, canSign, load, sign, backToOrder } = useContractPage()
const recuperation = computed(() => contract.value?.template.kind === "staff_recuperation")
const activeView = ref<"reading" | "signing">("reading")
const readerScrollTop = ref(0)
function selectView(view: "reading" | "signing"): void { if (!submitting.value) activeView.value = view }
function rememberReadingPosition(event: { readonly detail: { readonly scrollTop: number } }): void { readerScrollTop.value = event.detail.scrollTop }
watch(() => [contract.value?.id, contract.value?.snapshotHash], ([id, hash], [previousId, previousHash]) => {
  if (id !== previousId || hash !== previousHash) { activeView.value = "reading"; readerScrollTop.value = 0 }
})
function changeAgreement(event: { readonly detail: { readonly value: readonly string[] } }): void { agreed.value = event.detail.value.includes("agreed") }
function signingTime(iso: string | null): string { return iso ? new Date(iso).toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" }) : "" }
</script>

<template>
  <view class="discovery-page contract-page">
    <view class="contract-header">
      <text class="page-heading">{{ recuperation ? '职工疗休养合同' : '境内旅游合同' }}</text>
      <text v-if="state === 'ready' && contract" class="contract-total">本次报名金额 <text class="contract-amount">{{ formatFen(contract.order.amountFen) }}</text></text>
    </view>
    <DiscoveryState :state="state" :message="error" empty-title="此订单暂无在线合同" @retry="load" />
    <template v-if="state === 'ready' && contract">
      <view class="contract-tabs" aria-label="合同阅读与本人签字">
        <button class="button-secondary contract-tab" :class="{ 'contract-tab--active': activeView === 'reading' }" :aria-pressed="activeView === 'reading'" :disabled="submitting" @tap="selectView('reading')">阅读合同</button>
        <button class="button-secondary contract-tab" :class="{ 'contract-tab--active': activeView === 'signing' }" :aria-pressed="activeView === 'signing'" :disabled="submitting" @tap="selectView('signing')">{{ signed ? '签字记录' : '本人签字' }}</button>
      </view>
      <scroll-view v-if="activeView === 'reading'" class="contract-scroll contract-reader" scroll-y :show-scrollbar="true" :scroll-top="readerScrollTop" aria-label="合同全文阅读区" @scroll="rememberReadingPosition">
        <view class="contract-content">
          <text class="card-title">{{ contract.template.title }}</text>
          <text class="body-secondary">版本 {{ contract.template.version }}</text>
          <text class="detail-line">订单：{{ contract.order.code }}</text>
          <text class="detail-line">出行日期：{{ formatDateLabel(contract.order.startsAt) }} — {{ formatDateLabel(contract.order.endsAt) }}</text>
          <text v-for="(person, index) in contract.participants" :key="index" class="detail-line">{{ person.name }} · {{ person.kind === 'adult' ? '成人' : '学生' }}{{ person.identityMasked ? ` · ${person.identityMasked}` : '' }}</text>
          <text class="section-heading">合同全文</text>
          <text class="body-secondary contract-reading-hint">请仔细阅读全部条款，再进入本人签字。</text>
          <text class="contract-body" selectable>{{ contract.template.bodyText }}</text>
          <text class="body-secondary">来源：{{ contract.template.sourceFilename }}</text>
        </view>
      </scroll-view>
      <scroll-view v-else class="contract-scroll" scroll-y :show-scrollbar="true" aria-label="本人签字区">
        <view class="contract-content contract-signing">
          <text class="card-title">{{ signed ? (recuperation ? '本人已签字，待单位和旅行社处理' : '本人已签字，待旅行社处理') : '本人阅读确认与签字' }}</text>
          <text class="body-secondary">{{ contract.scopeStatement }}</text>
          <text v-if="recuperation" class="body-secondary">本人签字确认已阅读，单位和旅行社签章另行办理。</text>
          <template v-if="signed">
            <text class="detail-line">签字人：{{ contract.signerName }}</text>
            <text class="detail-line">签字时间：{{ signingTime(contract.signedAt) }}（北京时间）</text>
            <ContractSignaturePad :key="`signed-${contract.id}`" :model-value="contract.signature" readonly />
          </template>
          <template v-else>
            <label class="contract-name-label" for="contract-signer">{{ recuperation ? '本人姓名' : '签字家长 / 本人姓名' }}</label>
            <input id="contract-signer" v-model="signerName" class="contract-name" maxlength="80" :disabled="submitting" placeholder="请填写签字人的姓名" />
            <ContractSignaturePad :key="contract.snapshotHash" v-model="signature" :disabled="submitting" />
            <checkbox-group @change="changeAgreement"><label class="contract-agreement"><checkbox value="agreed" :checked="agreed" :disabled="submitting" color="#08776a" /><text>{{ recuperation ? '已阅读合同，确认本次报名信息，并以本人身份签字确认已知悉条款。' : '已阅读合同，确认本次报名信息，并以本人身份签字；未成年人由其监护人办理。' }}</text></label></checkbox-group>
            <text class="body-secondary">请填写姓名、完成手写签字并勾选确认后提交。</text>
            <text v-if="error" class="contract-error" role="alert">{{ error }}</text>
            <button v-if="error" class="button-secondary action-gap" :disabled="submitting" @tap="load">重新加载合同</button>
          </template>
        </view>
      </scroll-view>
      <view class="contract-actions">
        <template v-if="activeView === 'reading'">
          <button class="button-secondary" @tap="backToOrder">返回订单</button>
          <button class="button-primary" @tap="selectView('signing')">{{ signed ? '查看签字' : '去签字' }}</button>
        </template>
        <template v-else>
          <button class="button-secondary" :disabled="submitting" @tap="selectView('reading')">返回阅读</button>
          <button v-if="signed" class="button-primary" @tap="backToOrder">返回订单</button>
          <button v-else class="button-primary" :disabled="!canSign" :loading="submitting" @tap="sign">{{ submitting ? '正在提交签字' : '提交本人签字' }}</button>
        </template>
      </view>
    </template>
    <button v-else class="button-secondary action-gap" :disabled="submitting" @tap="backToOrder">返回订单</button>
  </view>
</template>

<style>
@import "../../styles/discovery.css";
.contract-page { display: flex; flex-direction: column; height: 100vh; height: 100dvh; min-height: 0; max-width: calc(var(--sheet-max-width) + var(--space-4) * 2); margin: 0 auto; padding-bottom: calc(var(--space-3) + env(safe-area-inset-bottom)); overflow: hidden; }
.contract-header, .contract-tabs, .contract-actions { flex-shrink: 0; }
.contract-header .page-heading { font-size: var(--font-h2); }
.contract-total { display: block; margin-top: var(--space-2); color: var(--text-secondary); font-size: var(--font-body-sm); line-height: 1.6; }
.contract-amount { color: var(--accent-warm); font-weight: 600; font-variant-numeric: tabular-nums; }
.contract-tabs { display: flex; gap: var(--space-2); margin: var(--space-3) 0; }
.contract-tab { flex: 1; background: var(--surface-secondary); color: var(--text-secondary); }
.contract-tab--active { color: var(--on-accent); background: var(--accent-primary); font-weight: 600; }
.contract-scroll { display: block; flex: 1; height: 0; min-height: 0; width: 100%; border-radius: var(--radius-card); background: var(--surface-elevated); }
.contract-content { padding: var(--space-4); }
.contract-content > .card-title { margin-top: 0; }
.contract-reading-hint { margin-bottom: var(--space-3); }
.contract-body { display: block; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--text-primary); font-size: var(--font-body); line-height: 1.8; }
.contract-actions { display: flex; align-items: stretch; gap: var(--space-3); padding-top: var(--space-3); }
.contract-actions .button-primary { flex: 1; }
.contract-actions button { display: flex; align-items: center; justify-content: center; min-width: 0; padding: var(--space-2) var(--space-3); line-height: 1.5; }
.contract-name-label { display: block; margin-top: var(--space-4); color: var(--text-primary); font-size: var(--font-body-sm); }
.contract-name { box-sizing: border-box; height: var(--size-touch-target); width: 100%; margin-top: var(--space-2); padding: 0 var(--space-3); border: 1px solid var(--border-default); border-radius: var(--radius-control); font-size: var(--font-body); color: var(--text-primary); }
.contract-name:focus { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
.contract-agreement { display: flex; align-items: flex-start; gap: var(--space-2); min-height: var(--size-touch-target); margin-top: var(--space-4); color: var(--text-primary); font-size: var(--font-body-sm); line-height: 1.6; }
.contract-agreement checkbox { flex-shrink: 0; }
.contract-error { display: block; margin-top: var(--space-3); color: var(--status-error); font-size: var(--font-body-sm); line-height: 1.6; }
</style>
