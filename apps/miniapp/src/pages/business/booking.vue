<script setup lang="ts">
import { ref } from "vue"
import { onHide, onLoad, onShow } from "@dcloudio/uni-app"
import { createBusinessApi } from "../../business-api"
import { readableError } from "../index/page-helpers"

const api = createBusinessApi()
const productId = ref("")
const bookingUrl = ref("")
const phone = ref("")
const error = ref("")
const loading = ref(true)
let readVersion = 0

onLoad((query) => { productId.value = typeof query?.["id"] === "string" ? query["id"] : "" })
onShow(() => { void load() })
onHide(() => { readVersion += 1; bookingUrl.value = "" })

async function load(): Promise<void> {
  const version = ++readVersion
  bookingUrl.value = ""
  phone.value = ""
  error.value = ""
  loading.value = true
  try {
    if (!productId.value) throw new Error("缺少服务信息，请返回服务详情重试。")
    const product = await api.getProduct(productId.value)
    if (version !== readVersion) return
    phone.value = product.customerServicePhone
    if (!product.bookingAuthorized || !product.bookingUrl.startsWith("https://")) throw new Error("该服务暂未开放在线预订，请联系工作人员。")
    bookingUrl.value = product.bookingUrl
  } catch (cause) {
    if (version === readVersion) error.value = readableError(cause, "预订入口暂时无法读取，请返回服务详情重试。")
  } finally {
    if (version === readVersion) loading.value = false
  }
}

function bookingFailed(): void {
  bookingUrl.value = ""
  error.value = "预订网页暂时无法打开，请联系工作人员。"
}

function callService(): void {
  uni.makePhoneCall({ phoneNumber: phone.value, fail: () => { error.value = "未能拨打电话，请按页面号码联系工作人员。" } })
}
</script>

<template>
  <web-view v-if="bookingUrl" :src="bookingUrl" @error="bookingFailed" />
  <view v-else class="discovery-page">
    <view class="info-card">
      <text class="page-heading">预订入口</text>
      <text class="detail-line">{{ loading ? '正在读取预订信息…' : error }}</text>
      <text v-if="phone" class="detail-line">联系电话：{{ phone }}</text>
      <button v-if="phone" class="button-primary" @tap="callService">电话咨询</button>
      <button v-if="!loading" class="button-secondary" @tap="load">重新读取</button>
    </view>
  </view>
</template>

<style>
@import "../../styles/discovery.css";
</style>
