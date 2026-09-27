<script setup lang="ts">
import { computed, ref } from "vue"
import { onLoad } from "@dcloudio/uni-app"
import DiscoveryState from "../../components/DiscoveryState.vue"
import { createPretripApi, type FamilyPretrip } from "../../pretrip-api"
import { type LoadState } from "../../enrollment-flow"
import { readableError } from "../index/page-helpers"

const api = createPretripApi()
const orderId = ref("")
const pretrip = ref<FamilyPretrip | null>(null)
const state = ref<LoadState>("loading")
const error = ref("")
const mapError = ref("")
const mapLocation = computed(() => {
  const config = pretrip.value?.config
  if (!config || config.gatheringLatitude === null || config.gatheringLongitude === null) return null
  return { latitude: config.gatheringLatitude, longitude: config.gatheringLongitude, name: config.gatheringPlace, address: config.gatheringPlace }
})
const statusText = { current: "车辆安排已确认", stale: "车辆安排待重排", unconfirmed: "车辆安排待确认" } as const
const assignedPeople = computed(() => pretrip.value?.persons.filter((person) => person.vehicleStatus === "assigned") ?? [])

onLoad((query) => { orderId.value = query?.["orderId"] ?? ""; void load() })

async function load(): Promise<void> {
  state.value = "loading"
  error.value = ""
  try {
    pretrip.value = await api.getPretrip(orderId.value)
    state.value = "ready"
  } catch (cause) {
    state.value = "error"
    error.value = readableError(cause, "行前信息加载失败，请重试")
  }
}

async function openAttachment(attachmentId: string): Promise<void> {
  try {
    const link = await api.createAttachmentUrl(orderId.value, attachmentId)
    uni.showModal({ title: "附件链接", content: `链接有效至 ${link.expiresAt}
${link.url}`, showCancel: false })
  } catch (cause) {
    uni.showToast({ title: readableError(cause, "附件链接生成失败"), icon: "none" })
  }
}

function openGatheringLocation(): void {
  const location = mapLocation.value
  if (location === null) return
  mapError.value = ""
  uni.openLocation({
    ...location,
    fail: (cause) => {
      mapError.value = cause.errMsg.toLowerCase().includes("cancel") ? "已取消打开地图，可重新打开" : "地图打开失败，请重试或联系行前联系人"
      uni.showToast({ title: mapError.value, icon: "none" })
    },
  })
}
</script>

<template>
  <view class="discovery-page">
    <text class="page-heading">行前服务</text>
    <DiscoveryState :state="state" :message="error" @retry="load" />
    <view v-if="state === 'ready' && pretrip">
      <view class="info-card">
        <text class="card-title">集合信息</text>
        <text v-if="pretrip.config" class="detail-line">{{ pretrip.config.gatheringAt ?? '时间待通知' }} · {{ pretrip.config.gatheringPlace }}</text>
        <button v-if="mapLocation" class="button-secondary action-gap gathering-map-button" @tap="openGatheringLocation">打开集合地点地图</button>
        <text v-if="mapError" class="detail-line gathering-map-error">{{ mapError }}</text>
        <text v-if="pretrip.config" class="detail-line">联系人：{{ pretrip.config.contactName }} {{ pretrip.config.contactPhone }}</text>
        <text v-if="pretrip.config" class="detail-line">{{ pretrip.config.itineraryNote }}</text>
        <text v-else class="detail-line">行前信息待发布。</text>
      </view>

      <view class="info-card">
        <text class="card-title">车辆信息</text>
        <text class="detail-line">{{ statusText[pretrip.transportStatus] }}</text>
        <text v-if="pretrip.transportStatus === 'stale'" class="test-notice">车辆安排已过期，待运营重新确认；页面不会显示旧车辆。</text>
        <view v-for="person in pretrip.persons" :key="person.orderLineId" class="participant-snapshot">
          <text class="card-title">{{ person.displayName }}</text>
          <text v-if="person.vehicle" class="detail-line">{{ person.vehicle.sequence }}号车 {{ person.vehicle.plateNumber || '车牌待补' }}</text>
          <text v-if="person.vehicle" class="detail-line">导游：{{ person.vehicle.guideName ?? '待补' }} {{ person.vehicle.guidePhone ?? '' }}</text>
          <text v-if="person.vehicle" class="detail-line teacher-contact">随车教师：{{ person.vehicle.teacherName ?? '待补' }} {{ person.vehicle.teacherPhone ?? '' }}</text>
          <text v-if="!person.vehicle" class="detail-line">{{ person.vehicleStatus === 'stale' ? '待重排' : '暂无已确认车辆' }}</text>
        </view>
        <text class="detail-line">已展示 {{ assignedPeople.length }} 人的当前车辆。</text>
      </view>

      <view v-if="pretrip.config?.attachments.length" class="info-card">
        <text class="card-title">附件</text>
        <button v-for="attachment in pretrip.config.attachments" :key="attachment.id" class="button-secondary action-gap" @tap="openAttachment(attachment.id)">{{ attachment.title }}</button>
      </view>
    </view>
  </view>
</template>

<style>
@import "../../styles/discovery.css";
</style>
