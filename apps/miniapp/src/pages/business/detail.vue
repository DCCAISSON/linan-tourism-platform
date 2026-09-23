<script setup lang="ts">
import { computed, reactive, ref } from "vue"
import { onLoad } from "@dcloudio/uni-app"
import DiscoveryState from "../../components/DiscoveryState.vue"
import { createBusinessApi, type BusinessProduct } from "../../business-api"
import { readableError } from "../index/page-helpers"
import { formatFen, type LoadState } from "../../enrollment-flow"

const api = createBusinessApi()
const product = ref<BusinessProduct>()
const state = ref<LoadState>("loading")
const error = ref("")
const submitting = ref(false)
const submitError = ref("")
const receipt = ref("")
const productId = ref("")
const form = reactive({
  customerType: "individual" as "individual" | "organization",
  organizationName: "",
  contactName: "",
  phone: "",
  request: "",
})
const categoryLabel = computed(() => {
  switch (product.value?.category) {
    case "tourism": return "旅游"
    case "wellness": return "疗休养"
    case "homestay": return "民宿"
    default: return "业务"
  }
})

onLoad((query) => {
  const id = typeof query?.["id"] === "string" ? query["id"] : ""
  productId.value = id
  void load()
})

async function load(): Promise<void> {
  if (!productId.value) {
    state.value = "error"
    error.value = "业务内容不存在"
    return
  }
  state.value = "loading"
  error.value = ""
  try {
    product.value = await api.getProduct(productId.value)
    state.value = "ready"
  } catch (cause) {
    state.value = "error"
    error.value = readableError(cause, "业务内容加载失败，请重试")
  }
}

async function submitInquiry(): Promise<void> {
  if (product.value === undefined || submitting.value) return
  submitting.value = true
  submitError.value = ""
  receipt.value = ""
  try {
    const result = await api.submitInquiry(product.value.id, {
      idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      customerType: form.customerType,
      organizationName: form.customerType === "organization" ? form.organizationName : "",
      contactName: form.contactName,
      phone: form.phone,
      request: form.request,
    })
    receipt.value = `咨询已提交，回执号：${result.id}`
    form.request = ""
  } catch (cause) {
    submitError.value = readableError(cause, "咨询提交失败，请核对手机号和需求内容")
  } finally {
    submitting.value = false
  }
}

function priceText(value: number | null): string {
  return value === null ? "价格待工作人员确认" : `参考 ${formatFen(value)}`
}
</script>

<template>
  <view class="discovery-page business-detail-page">
    <DiscoveryState :state="state" :message="error" empty-title="业务内容不存在" @retry="load" />
    <view v-if="state === 'ready' && product" class="business-detail">
      <image v-if="product.media[0]?.kind === 'image'" class="business-hero" :src="product.media[0].url" mode="aspectFill" />
      <text class="caption">{{ categoryLabel }}</text>
      <text class="page-heading">{{ product.title }}</text>
      <text class="page-subtitle">{{ product.offering }}</text>
      <view class="info-card">
        <text class="card-title">{{ priceText(product.referencePriceFen) }}</text>
        <text class="detail-line">{{ product.content }}</text>
        <text v-if="product.customerServicePhone" class="detail-line">客服电话：{{ product.customerServicePhone }}</text>
        <text v-if="product.bookingUrl" class="detail-line">授权入口：{{ product.bookingUrl }}</text>
      </view>
      <view class="info-card business-form-card">
        <text class="section-heading">咨询需求</text>
        <view class="business-type-row">
          <button class="button-secondary" :class="{ 'business-type-row--selected': form.customerType === 'individual' }" @tap="form.customerType = 'individual'">个人</button>
          <button class="button-secondary" :class="{ 'business-type-row--selected': form.customerType === 'organization' }" @tap="form.customerType = 'organization'">单位</button>
        </view>
        <input v-if="form.customerType === 'organization'" v-model="form.organizationName" class="field-input" placeholder="单位名称" />
        <input v-model="form.contactName" class="field-input" placeholder="联系人" />
        <input v-model="form.phone" class="field-input" placeholder="手机号" type="number" />
        <textarea v-model="form.request" class="field-textarea" placeholder="想咨询的日期、人数或套餐需求" />
        <text v-if="receipt" class="success-line">{{ receipt }}</text>
        <text v-if="submitError" class="error-line">{{ submitError }}</text>
        <button class="button-primary action-gap" :disabled="submitting" @tap="submitInquiry">{{ submitting ? "提交中" : "提交咨询" }}</button>
      </view>
      <text class="test-notice">提交咨询只生成回执和跟进记录，不代表已付款、已预订或有房。</text>
    </view>
  </view>
</template>

<style>
@import "../../styles/discovery.css";
.business-detail { display: grid; gap: var(--space-4); }
.business-hero { width: 100%; height: 420rpx; border-radius: var(--radius-banner); background: var(--surface-secondary); }
.business-form-card { gap: var(--space-3); }
.business-type-row { display: flex; gap: var(--space-2); }
.business-type-row button { flex: 1; min-width: 0; }
.business-type-row--selected { color: var(--on-accent); background: var(--accent-primary); }
.field-input,
.field-textarea { box-sizing: border-box; width: 100%; min-height: 88rpx; padding: var(--space-3); border: 1px solid var(--border-default); border-radius: var(--radius-control); background: var(--surface-primary); color: var(--text-primary); font-size: var(--font-body); }
.field-textarea { min-height: 180rpx; }
.success-line { color: var(--status-success); font-size: var(--font-body-sm); }
.error-line { color: var(--status-error); font-size: var(--font-body-sm); }
</style>
