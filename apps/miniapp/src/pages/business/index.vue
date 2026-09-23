<script setup lang="ts">
import { computed, ref } from "vue"
import { onShow } from "@dcloudio/uni-app"
import DiscoveryState from "../../components/DiscoveryState.vue"
import { createBusinessApi, type BusinessCategory, type BusinessProduct } from "../../business-api"
import { readableError } from "../index/page-helpers"
import { formatFen, type LoadState } from "../../enrollment-flow"

const api = createBusinessApi()
const products = ref<readonly BusinessProduct[]>([])
const state = ref<LoadState>("loading")
const error = ref("")
const selectedCategory = ref<BusinessCategory>("tourism")
const categories = [
  { value: "tourism", label: "旅游" },
  { value: "wellness", label: "疗休养" },
  { value: "homestay", label: "民宿" },
] as const
const currentTitle = computed(() => categories.find((item) => item.value === selectedCategory.value)?.label ?? "业务")

onShow(() => { void load() })

async function load(): Promise<void> {
  state.value = "loading"
  error.value = ""
  try {
    products.value = await api.listProducts(selectedCategory.value)
    state.value = products.value.length > 0 ? "ready" : "empty"
  } catch (cause) {
    state.value = "error"
    error.value = readableError(cause, "业务内容加载失败，请重试")
  }
}

function switchCategory(value: BusinessCategory): void {
  selectedCategory.value = value
  void load()
}

function openProduct(id: string): void {
  uni.navigateTo({ url: `/pages/business/detail?id=${encodeURIComponent(id)}` })
}

function priceText(value: number | null): string {
  return value === null ? "价格待确认" : `参考 ${formatFen(value)}`
}
</script>

<template>
  <view class="discovery-page business-page">
    <text class="page-heading">临安文旅服务</text>
    <text class="page-subtitle">查看旅游、疗休养和民宿基础资料，提交咨询后由工作人员跟进。</text>
    <view class="business-tabs">
      <button
        v-for="category in categories"
        :key="category.value"
        class="button-secondary"
        :class="{ 'business-tabs--selected': selectedCategory === category.value }"
        @tap="switchCategory(category.value)"
      >
        {{ category.label }}
      </button>
    </view>
    <DiscoveryState :state="state" :message="error" :empty-title="`暂无已发布${currentTitle}内容`" @retry="load" />
    <view v-if="state === 'ready'">
      <view v-for="product in products" :key="product.id" class="info-card business-card">
        <image v-if="product.media[0]?.kind === 'image'" class="business-cover" :src="product.media[0].url" mode="aspectFill" />
        <view class="row-between">
          <text class="caption">{{ currentTitle }}</text>
          <text class="badge">{{ priceText(product.referencePriceFen) }}</text>
        </view>
        <text class="card-title">{{ product.title }}</text>
        <text class="body-secondary">{{ product.offering }}</text>
        <text class="detail-line">{{ product.content }}</text>
        <button class="button-primary action-gap" @tap="openProduct(product.id)">查看并咨询</button>
      </view>
    </view>
    <text class="test-notice">本页只提供资料和咨询回执，不代表已预订、已付款或实时库存。</text>
  </view>
</template>

<style>
@import "../../styles/discovery.css";
.business-tabs { display: flex; gap: var(--space-2); margin: var(--space-4) 0; }
.business-tabs button { flex: 1; min-width: 0; font-size: var(--font-body-sm); }
.business-tabs--selected { color: var(--on-accent); background: var(--accent-primary); }
.business-card { gap: var(--space-3); }
.business-cover { width: 100%; height: 320rpx; border-radius: var(--radius-card); background: var(--surface-secondary); }
</style>
