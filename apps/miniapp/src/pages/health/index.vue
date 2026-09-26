<script setup lang="ts">
import { computed, reactive, ref } from "vue"
import { onLoad } from "@dcloudio/uni-app"
import { createMiniappApi, type OrderDetail, type OrderParticipant } from "../../api"
import { createExecutionHealthClient, type FamilyPublicExecutionSummary, type HealthAuthorization } from "../../execution-health-api"

const client = createExecutionHealthClient()
const api = createMiniappApi()
const orderId = ref("")
const message = ref("")
const summary = ref<FamilyPublicExecutionSummary | null>(null)
const authorization = ref<HealthAuthorization | null>(null)
const order = ref<OrderDetail | null>(null)
const selectedPersonIndex = ref(0)
const form = reactive({ allergies: "", medicalNotes: "", emergencyMedicine: "" })
const participants = computed(() => order.value?.participants ?? [])
const participantOptions = computed(() => participants.value.map(participantLabel))
const selectedParticipantLineId = computed(() => {
  const person = participants.value[selectedPersonIndex.value]
  return person?.id ?? ""
})

onLoad((query) => {
  orderId.value = query?.["orderId"] ?? ""
  if (orderId.value.length > 0) void load()
})

async function load(): Promise<void> {
  message.value = ""
  try {
    const [nextSummary, nextOrder] = await Promise.all([client.publicSummary(orderId.value), api.getOrderDetail(orderId.value)])
    summary.value = nextSummary
    order.value = nextOrder
    selectedPersonIndex.value = 0
  } catch (error) {
    message.value = error instanceof Error ? error.message : "读取公开摘要失败"
  }
}

async function authorize(): Promise<void> {
  message.value = ""
  if (selectedParticipantLineId.value.length === 0) {
    message.value = "请选择授权成员"
    return
  }
  try {
    authorization.value = await client.authorizePaidHealth(orderId.value, selectedParticipantLineId.value, { allergies: form.allergies, medicalNotes: form.medicalNotes, emergencyMedicine: form.emergencyMedicine })
    message.value = "健康授权已提交"
  } catch (error) {
    message.value = error instanceof Error ? error.message : "提交健康授权失败"
  }
}

async function revoke(): Promise<void> {
  message.value = ""
  if (selectedParticipantLineId.value.length === 0) {
    message.value = "请选择授权成员"
    return
  }
  try {
    authorization.value = await client.revokePaidHealth(orderId.value, selectedParticipantLineId.value)
    message.value = "健康授权已撤回"
  } catch (error) {
    message.value = error instanceof Error ? error.message : "撤回健康授权失败"
  }
}

function participantLabel(person: OrderParticipant): string {
  const placement = person.participantKind === "adult" ? "成人" : [person.gradeName, person.className].filter(Boolean).join(" ")
  return `${person.displayName} · ${placement}`
}
</script>

<template>
  <view class="health-page">
    <view class="hero">
      <text class="eyebrow">出行健康</text>
      <text class="title">公开摘要与健康授权</text>
      <text class="hint">家属端只能看到已批准公开的摘要；健康原文需要单独授权，可随时撤回。</text>
    </view>

    <view class="card">
      <button class="button-primary" @tap="load">刷新公开摘要</button>
    </view>

    <view v-if="summary" class="card">
      <text class="section-title">公开日报</text>
      <text v-for="item in summary.dailyReports" :key="item.reportDate" class="line">{{ item.reportDate }}：{{ item.publicSummary }}</text>
      <text class="section-title">公开事件</text>
      <text v-for="item in summary.events" :key="item.occurredAt" class="line">{{ item.publicSummary }}</text>
    </view>

    <view class="card">
      <text class="section-title">健康授权</text>
      <picker mode="selector" :range="participantOptions" @change="selectedPersonIndex = Number($event.detail.value)">
        <view class="field">{{ participantOptions[selectedPersonIndex] ?? "请选择授权成员" }}</view>
      </picker>
      <textarea v-model="form.allergies" class="area" placeholder="过敏史" />
      <textarea v-model="form.medicalNotes" class="area" placeholder="健康备注" />
      <textarea v-model="form.emergencyMedicine" class="area" placeholder="应急用药" />
      <button class="button-primary" @tap="authorize">提交授权</button>
      <button class="button-secondary" @tap="revoke">撤回授权</button>
      <text v-if="authorization" class="line">授权状态：{{ authorization.active ? '已授权' : '已撤回' }}</text>
    </view>

    <text v-if="message" class="notice">{{ message }}</text>
  </view>
</template>

<style>
@import "../../styles/discovery.css";
.health-page { min-height: 100vh; padding: 32rpx; background: var(--surface-primary); }
.hero, .card { display: flex; flex-direction: column; gap: 16rpx; margin-bottom: 24rpx; padding: 28rpx; border-radius: 24rpx; background: var(--surface-elevated); }
.eyebrow { color: var(--accent-primary); font-size: 24rpx; font-weight: 700; }
.title { color: var(--text-primary); font-size: 40rpx; font-weight: 700; }
.hint, .line, .notice { color: var(--text-secondary); font-size: 28rpx; line-height: 1.6; }
.section-title { color: var(--text-primary); font-size: 30rpx; font-weight: 700; }
.field, .area { box-sizing: border-box; width: 100%; border: 1px solid var(--border-default); border-radius: 16rpx; padding: 18rpx; background: var(--surface-elevated); font-size: 28rpx; }
.area { min-height: 140rpx; }
.button-primary, .button-secondary { border-radius: 999rpx; font-size: 28rpx; }
.button-primary { color: var(--on-accent); background: var(--accent-primary); }
.button-secondary { color: var(--text-primary); background: var(--surface-secondary); }
</style>
