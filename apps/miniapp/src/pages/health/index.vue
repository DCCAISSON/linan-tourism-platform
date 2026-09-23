<script setup lang="ts">
import { reactive, ref } from "vue"
import { onLoad } from "@dcloudio/uni-app"
import { createExecutionHealthClient, type FamilyPublicExecutionSummary, type HealthAuthorization, type PersonRef } from "../../execution-health-api"

const client = createExecutionHealthClient()
const orderId = ref("")
const message = ref("")
const summary = ref<FamilyPublicExecutionSummary | null>(null)
const authorization = ref<HealthAuthorization | null>(null)
const form = reactive({ personRef: "" as PersonRef | "", allergies: "", medicalNotes: "", emergencyMedicine: "" })

onLoad((query) => {
  orderId.value = query?.["orderId"] ?? ""
  if (orderId.value.length > 0) void loadSummary()
})

async function loadSummary(): Promise<void> {
  message.value = ""
  try { summary.value = await client.publicSummary(orderId.value) }
  catch (error) { message.value = error instanceof Error ? error.message : "读取公开摘要失败" }
}
async function authorize(): Promise<void> {
  message.value = ""
  try {
    authorization.value = await client.authorizeHealth(orderId.value, { personRef: form.personRef as PersonRef, allergies: form.allergies, medicalNotes: form.medicalNotes, emergencyMedicine: form.emergencyMedicine })
    message.value = "健康授权已提交"
  } catch (error) { message.value = error instanceof Error ? error.message : "提交健康授权失败" }
}
async function revoke(): Promise<void> {
  message.value = ""
  try {
    authorization.value = await client.revokeHealth(orderId.value, form.personRef as PersonRef)
    message.value = "健康授权已撤回"
  } catch (error) { message.value = error instanceof Error ? error.message : "撤回健康授权失败" }
}
</script>

<template>
  <view class="health-page">
    <view class="hero"><text class="eyebrow">出行健康</text><text class="title">公开摘要与健康授权</text><text class="hint">家属端只能看到已批准公开的摘要；健康原文需要单独授权，可随时撤回。</text></view>
    <view class="card"><input v-model="orderId" class="field" placeholder="订单 ID" /><button class="button-primary" @tap="loadSummary">读取公开摘要</button></view>
    <view v-if="summary" class="card"><text class="section-title">公开日报</text><text v-for="item in summary.dailyReports" :key="item.reportDate" class="line">{{ item.reportDate }}：{{ item.publicSummary }}</text><text class="section-title">公开事件</text><text v-for="item in summary.events" :key="item.occurredAt" class="line">{{ item.publicSummary }}</text></view>
    <view class="card"><text class="section-title">健康授权</text><input v-model="form.personRef" class="field" placeholder="人员 personRef，如 paid:line-id" /><textarea v-model="form.allergies" class="area" placeholder="过敏史" /><textarea v-model="form.medicalNotes" class="area" placeholder="健康备注" /><textarea v-model="form.emergencyMedicine" class="area" placeholder="应急用药" /><button class="button-primary" @tap="authorize">提交授权</button><button class="button-secondary" @tap="revoke">撤回授权</button><text v-if="authorization" class="line">当前版本：{{ authorization.version }}；状态：{{ authorization.active ? '已授权' : '已撤回' }}</text></view>
    <text v-if="message" class="notice">{{ message }}</text>
  </view>
</template>

<style>
@import "../../styles/discovery.css";
.health-page { min-height: 100vh; padding: 32rpx; background: #f8fafc; }
.hero, .card { display: flex; flex-direction: column; gap: 16rpx; margin-bottom: 24rpx; padding: 28rpx; border-radius: 24rpx; background: #ffffff; }
.eyebrow { color: #2563eb; font-size: 24rpx; font-weight: 700; }
.title { color: #0f172a; font-size: 40rpx; font-weight: 700; }
.hint, .line, .notice { color: #475569; font-size: 28rpx; line-height: 1.6; }
.section-title { color: #1f2937; font-size: 30rpx; font-weight: 700; }
.field, .area { box-sizing: border-box; width: 100%; border: 1px solid #cbd5e1; border-radius: 16rpx; padding: 18rpx; background: #fff; font-size: 28rpx; }
.area { min-height: 140rpx; }
.button-primary, .button-secondary { border-radius: 999rpx; font-size: 28rpx; }
.button-primary { color: #fff; background: #2563eb; }
.button-secondary { color: #1f2937; background: #e2e8f0; }
</style>
