<script setup lang="ts">
import { computed } from "vue"
import DiscoveryState from "../../components/DiscoveryState.vue"
import ContractSignaturePad from "../../components/ContractSignaturePad.vue"
import { formatDateLabel, formatFen } from "../../enrollment-flow"
import { useContractPage } from "./useContractPage"
const { contract, state, error, signerName, agreed, signature, submitting, signed, canSign, load, sign, backToOrder } = useContractPage()
const recuperation = computed(() => contract.value?.template.kind === "staff_recuperation")
function changeAgreement(event: { readonly detail: { readonly value: readonly string[] } }): void { agreed.value = event.detail.value.includes("agreed") }
function signingTime(iso: string | null): string { return iso ? new Date(iso).toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" }) : "" }
</script>

<template>
  <view class="discovery-page contract-page">
    <text class="page-heading">{{ signed ? '合同与签字记录' : '阅读合同并签字' }}</text>
    <DiscoveryState :state="state" :message="error" empty-title="此订单暂无在线合同" @retry="load" />
    <template v-if="state === 'ready' && contract">
      <view class="info-card contract-summary">
        <text class="card-title">{{ contract.template.title }}</text>
        <text class="body-secondary">版本 {{ contract.template.version }}</text>
        <text class="detail-line">订单：{{ contract.order.code }}</text>
        <text class="detail-line">出行日期：{{ formatDateLabel(contract.order.startsAt) }} — {{ formatDateLabel(contract.order.endsAt) }}</text>
        <text class="detail-line">本次报名金额：<text class="contract-amount">{{ formatFen(contract.order.amountFen) }}</text></text>
        <text v-for="(person, index) in contract.participants" :key="index" class="detail-line">{{ person.name }} · {{ person.kind === 'adult' ? '成人' : '学生' }}{{ person.identityMasked ? ` · ${person.identityMasked}` : '' }}</text>
      </view>
      <text class="section-heading">合同全文</text>
      <text class="body-secondary">请在下方阅读区上下滑动，仔细阅读全部条款。</text>
      <scroll-view class="contract-reader" scroll-y :show-scrollbar="true" aria-label="合同全文阅读区"><text class="contract-body" selectable>{{ contract.template.bodyText }}</text></scroll-view>
      <text class="body-secondary">来源：{{ contract.template.sourceFilename }}</text>
      <view class="info-card contract-signing">
        <text class="card-title">{{ signed ? (recuperation ? '本人已签字，待单位和旅行社处理' : '家长已签字，待旅行社处理') : '本人阅读确认与签字' }}</text>
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
          <button class="button-primary action-gap" :disabled="!canSign" :loading="submitting" @tap="sign">{{ submitting ? '正在提交签字' : '确认提交本人签字' }}</button>
          <button v-if="error" class="button-secondary action-gap" :disabled="submitting" @tap="load">重新加载合同</button>
        </template>
      </view>
    </template>
    <button class="button-secondary action-gap" :disabled="submitting" @tap="backToOrder">{{ signed ? '返回订单，继续办理' : '返回订单' }}</button>
  </view>
</template>

<style>
@import "../../styles/discovery.css";
.contract-page { max-width: calc(var(--sheet-max-width) + var(--space-4) * 2); margin: 0 auto; }
.contract-summary .card-title, .contract-signing .card-title { margin-top: 0; }
.contract-amount { color: var(--accent-warm); font-weight: 600; }
.contract-reader { box-sizing: border-box; display: block; height: 52vh; min-height: calc(var(--space-10) * 3); margin-top: var(--space-3); border-radius: var(--radius-card); background: var(--surface-elevated); }
.contract-body { display: block; padding: var(--space-4); white-space: pre-wrap; overflow-wrap: anywhere; color: var(--text-primary); font-size: var(--font-body); line-height: 1.8; }
.contract-name-label { display: block; margin-top: var(--space-4); color: var(--text-primary); font-size: var(--font-body-sm); }
.contract-name { box-sizing: border-box; height: var(--size-touch-target); width: 100%; margin-top: var(--space-2); padding: 0 var(--space-3); border: 1px solid var(--border-default); border-radius: var(--radius-control); font-size: var(--font-body); color: var(--text-primary); }
.contract-name:focus { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
.contract-agreement { display: flex; align-items: flex-start; gap: var(--space-2); min-height: var(--size-touch-target); margin-top: var(--space-4); color: var(--text-primary); font-size: var(--font-body-sm); line-height: 1.6; }
.contract-agreement checkbox { flex-shrink: 0; }
.contract-error { display: block; margin-top: var(--space-3); color: var(--status-error); font-size: var(--font-body-sm); line-height: 1.6; }
</style>
