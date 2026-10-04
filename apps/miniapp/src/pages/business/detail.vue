<script setup lang="ts">
import { computed, reactive, ref } from "vue"
import { onLoad } from "@dcloudio/uni-app"
import DiscoveryState from "../../components/DiscoveryState.vue"
import ServiceConsent from "../../components/ServiceConsent.vue"
import ConsultationEntry from "../../components/ConsultationEntry.vue"
import { createBusinessApi, type BusinessProduct } from "../../business-api"
import { readableError } from "../index/page-helpers"
import { formatFen, type LoadState } from "../../enrollment-flow"
import { hasServiceConsent } from "../../service-consent"

const api = createBusinessApi()
const product = ref<BusinessProduct>()
const state = ref<LoadState>("loading")
const error = ref("")
const submitting = ref(false)
const submitError = ref("")
const receipt = ref("")
const productId = ref("")
const mediaError = ref(false)
const contactError = ref("")
const consentRequired = ref(false)
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
    default: return "服务"
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
    error.value = "这项服务暂时无法查看"
    return
  }
  state.value = "loading"
  error.value = ""
  try {
    product.value = await api.getProduct(productId.value)
    state.value = "ready"
  } catch (cause) {
    state.value = "error"
    error.value = readableError(cause, "服务资料加载失败，请稍后再试")
  }
}

async function submitInquiry(): Promise<void> {
  if (product.value === undefined || submitting.value) return
  if (!hasServiceConsent()) {
    consentRequired.value = true
    submitError.value = "提交联系信息前，请先阅读并同意隐私保护指引。"
    return
  }
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
    receipt.value = `咨询已提交，编号：${result.id}`
    form.request = ""
  } catch (cause) {
    submitError.value = readableError(cause, "咨询提交失败，请核对手机号和需求内容")
  } finally {
    submitting.value = false
  }
}

function priceText(value: number | null): string {
  return value === null ? "价格待工作人员确认" : `参考价 ${formatFen(value)}`
}

function callService(): void {
  if (!product.value?.customerServicePhone) return
  contactError.value = ""
  uni.makePhoneCall({ phoneNumber: product.value.customerServicePhone, fail: () => { contactError.value = "未能拨打电话，请按页面号码联系工作人员。" } })
}

function openBooking(): void {
  if (!product.value?.bookingAuthorized || !product.value.bookingUrl) return
  uni.navigateTo({ url: `/pages/business/booking?id=${encodeURIComponent(product.value.id)}` })
}
</script>

<template>
  <ServiceConsent :required="consentRequired" @accepted="consentRequired = false" @declined="consentRequired = false" />
  <view class="discovery-page business-detail-page">
    <DiscoveryState :state="state" :message="error" empty-title="这项服务暂时无法查看" @retry="load" />
    <view v-if="state === 'ready' && product" class="business-detail">
      <view v-if="product.mediaAuthorized && product.media.length" class="business-gallery">
        <template v-for="(media, index) in product.media" :key="media.url">
          <image v-if="media.kind === 'image'" class="business-hero" :src="media.url" mode="aspectFill" :aria-label="`${product.title}图片${index + 1}`" @error="mediaError = true" />
          <video v-else class="business-hero" :src="media.url" controls :autoplay="false" @error="mediaError = true" />
        </template>
        <text v-if="mediaError" class="error-line">部分图片或视频暂时无法加载，您仍可查看介绍和联系工作人员。</text>
      </view>
      <text class="caption">{{ categoryLabel }}</text>
      <text class="page-heading">{{ product.title }}</text>
      <text class="page-subtitle">{{ product.offering }}</text>
      <view class="info-card business-service-card">
        <text class="card-title">{{ priceText(product.referencePriceFen) }}</text>
        <text class="detail-line">{{ product.content }}</text>
        <text v-if="product.customerServicePhone" class="detail-line">联系电话：{{ product.customerServicePhone }}</text>
        <button v-if="product.customerServicePhone" class="button-secondary" @tap="callService">电话咨询</button>
        <button v-if="product.bookingAuthorized && product.bookingUrl" class="button-primary" @tap="openBooking">前往预订入口</button>
        <text v-if="product.bookingAuthorized && product.bookingUrl" class="caption">服务方将确认价格、房态或名额，并为您办理预订。</text>
        <text v-if="contactError" class="error-line">{{ contactError }}</text>
      </view>
      <ConsultationEntry :context="{ source: 'business', id: product.id }" />
      <view class="info-card business-form-card">
        <text class="section-heading">说说您的需求</text>
        <text class="caption">可填写日期、目的地、人数、预算、住宿和用餐安排；单位疗休养可补充结算需求。具体行程、费用包含及不含项目由工作人员确认。</text>
        <view class="business-type-row">
          <button class="button-secondary" :class="{ 'business-type-row--selected': form.customerType === 'individual' }" @tap="form.customerType = 'individual'">个人</button>
          <button class="button-secondary" :class="{ 'business-type-row--selected': form.customerType === 'organization' }" @tap="form.customerType = 'organization'">单位</button>
        </view>
        <input v-if="form.customerType === 'organization'" v-model="form.organizationName" class="field-input" placeholder="单位名称" />
        <input v-model="form.contactName" class="field-input" placeholder="联系人" />
        <input v-model="form.phone" class="field-input" placeholder="手机号" type="number" />
        <textarea v-model="form.request" class="field-textarea" placeholder="想咨询的日期、人数或服务需求" />
        <text v-if="receipt" class="success-line">{{ receipt }}</text>
        <text v-if="submitError" class="error-line">{{ submitError }}</text>
        <button class="button-primary action-gap" :disabled="submitting" @tap="submitInquiry">{{ submitting ? "提交中" : "提交咨询" }}</button>
      </view>
      <text class="test-notice">咨询提交后，工作人员将联系您确认需求及预订安排。</text>
    </view>
  </view>
</template>

<style>
@import "../../styles/discovery.css";
.business-detail { display: grid; gap: var(--space-4); }
.business-gallery { display: grid; gap: var(--space-3); }
.business-hero { width: 100%; height: 420rpx; border-radius: var(--radius-banner); background: var(--surface-secondary); }
.business-form-card, .business-service-card { display: grid; gap: var(--space-3); }
.business-type-row { display: flex; gap: var(--space-2); }
.business-type-row button { flex: 1; min-width: 0; }
.business-type-row--selected { color: var(--on-accent); background: var(--accent-primary); }
.field-input,
.field-textarea { box-sizing: border-box; width: 100%; min-height: 88rpx; padding: var(--space-3); border: 1px solid var(--border-default); border-radius: var(--radius-control); background: var(--surface-primary); color: var(--text-primary); font-size: var(--font-body); }
.field-textarea { min-height: 180rpx; }
.success-line { color: var(--status-success); font-size: var(--font-body-sm); }
.error-line { color: var(--status-error); font-size: var(--font-body-sm); }
</style>
