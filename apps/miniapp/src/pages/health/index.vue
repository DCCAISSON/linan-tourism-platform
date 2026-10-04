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
const order = ref<OrderDetail | null>(null)
const selectedPersonIndex = ref(0)
const loading = ref(false)
type PersonHealthState = {
  form: { allergies: string; medicalNotes: string; emergencyMedicine: string }
  authorization: HealthAuthorization | null
  message: string
  pending: "save" | "revoke" | null
}
const healthByPerson = reactive(new Map<string, PersonHealthState>())
const participants = computed(() => order.value?.participants ?? [])
const participantOptions = computed(() => participants.value.map(participantLabel))
const selectedPersonName = computed(() => participants.value[selectedPersonIndex.value]?.displayName ?? "")
const selectedParticipantLineId = computed(() => {
  const person = participants.value[selectedPersonIndex.value]
  return person?.id ?? ""
})
const selectedHealth = computed(() => healthByPerson.get(selectedParticipantLineId.value))
const form = computed(() => selectedHealth.value?.form ?? { allergies: "", medicalNotes: "", emergencyMedicine: "" })
const authorization = computed(() => selectedHealth.value?.authorization ?? null)
const healthMessage = computed(() => selectedHealth.value?.message ?? "")
const pending = computed(() => selectedHealth.value?.pending ?? null)

onLoad((query) => {
  orderId.value = query?.["orderId"] ?? ""
  if (orderId.value.length > 0) void load()
})

async function load(): Promise<void> {
  message.value = ""
  loading.value = true
  try {
    const [nextSummary, nextOrder] = await Promise.all([client.publicSummary(orderId.value), api.getOrderDetail(orderId.value)])
    const previousLineId = selectedParticipantLineId.value
    for (const person of nextOrder.participants) {
      if (!healthByPerson.has(person.id)) healthByPerson.set(person.id, { form: { allergies: "", medicalNotes: "", emergencyMedicine: "" }, authorization: null, message: "", pending: null })
    }
    summary.value = nextSummary
    order.value = nextOrder
    selectedPersonIndex.value = Math.max(0, nextOrder.participants.findIndex((person) => person.id === previousLineId))
  } catch (error) {
    message.value = error instanceof Error ? error.message : "暂时无法读取行程动态，请稍后再试"
  } finally {
    loading.value = false
  }
}

async function authorize(): Promise<void> {
  message.value = ""
  const lineId = selectedParticipantLineId.value
  const health = selectedHealth.value
  const name = selectedPersonName.value
  if (!health) {
    message.value = "请选择授权成员"
    return
  }
  if (health.pending !== null) return
  health.message = ""
  health.pending = "save"
  try {
    health.authorization = await client.authorizePaidHealth(orderId.value, lineId, { ...health.form })
    health.message = `${name}的健康授权已保存`
  } catch (error) {
    health.message = error instanceof Error ? error.message : "健康授权保存失败，请稍后再试"
  } finally {
    health.pending = null
  }
}

async function revoke(): Promise<void> {
  message.value = ""
  const lineId = selectedParticipantLineId.value
  const health = selectedHealth.value
  const name = selectedPersonName.value
  if (!health) {
    message.value = "请选择授权成员"
    return
  }
  if (health.pending !== null) return
  health.message = ""
  health.pending = "revoke"
  try {
    health.authorization = await client.revokePaidHealth(orderId.value, lineId)
    health.message = `${name}的健康授权已撤回`
  } catch (error) {
    health.message = error instanceof Error ? error.message : "撤回健康授权失败，请稍后再试"
  } finally {
    health.pending = null
  }
}

function participantLabel(person: OrderParticipant): string {
  const placement = person.participantKind === "adult" ? "成人" : [person.gradeName, person.className].filter(Boolean).join(" ")
  return `${person.displayName} · ${placement}`
}
</script>

<template>
  <view class="discovery-page health-page">
    <view class="health-overview">
      <text class="health-eyebrow">出行健康</text>
      <text class="page-heading">行程动态与健康授权</text>
      <text class="page-subtitle">这里只展示已公开的行程动态；健康信息需要您单独授权，可随时撤回。</text>
      <button class="button-secondary health-refresh" :disabled="loading" @tap="load">{{ loading ? "正在刷新" : "刷新行程动态" }}</button>
    </view>

    <view v-if="summary" class="info-card health-summary">
      <text class="section-heading health-summary-heading">家人每日情况</text>
      <text v-if="summary.personDailyReports.length === 0" class="body-secondary health-line">暂时没有家人的每日动态。</text>
      <text v-for="item in summary.personDailyReports" :key="`${item.personRef}:${item.reportDate}`" class="detail-line health-line">{{ item.displayName }} · {{ item.reportDate }}：{{ item.publicSummary }}</text>
      <text class="section-heading health-summary-heading">每日动态</text>
      <text v-if="summary.dailyReports.length === 0" class="body-secondary health-line">暂时没有每日动态。</text>
      <text v-for="item in summary.dailyReports" :key="item.reportDate" class="detail-line health-line">{{ item.reportDate }}：{{ item.publicSummary }}</text>
      <text class="section-heading health-summary-heading">其他动态</text>
      <text v-if="summary.events.length === 0" class="body-secondary health-line">暂时没有其他动态。</text>
      <text v-for="item in summary.events" :key="item.occurredAt" class="detail-line health-line">{{ item.publicSummary }}</text>
    </view>

    <view class="info-card health-form">
      <text class="section-heading health-form-heading">健康授权</text>
      <text class="body-secondary">选择参加人后填写需要告知工作人员的健康信息。</text>
      <picker mode="selector" :range="participantOptions" :value="selectedPersonIndex" :disabled="loading" @change="selectedPersonIndex = Number($event.detail.value)">
        <view class="filter-picker health-participant-picker">{{ participantOptions[selectedPersonIndex] ?? "请选择授权成员" }}</view>
      </picker>
      <text v-if="selectedPersonName" class="detail-line health-current-person">正在填写：{{ selectedPersonName }}</text>
      <textarea v-model="form.allergies" :disabled="!selectedHealth || pending !== null" class="health-textarea" placeholder="过敏史" />
      <textarea v-model="form.medicalNotes" :disabled="!selectedHealth || pending !== null" class="health-textarea" placeholder="健康备注" />
      <textarea v-model="form.emergencyMedicine" :disabled="!selectedHealth || pending !== null" class="health-textarea" placeholder="应急用药" />
      <button class="button-primary health-authorize" :disabled="!selectedHealth || pending !== null" @tap="authorize">{{ pending === 'save' ? '正在保存授权' : '提交授权' }}</button>
      <button class="button-secondary health-revoke" :disabled="!selectedHealth || pending !== null" @tap="revoke">{{ pending === 'revoke' ? '正在撤回授权' : '撤回授权' }}</button>
      <text v-if="authorization" class="detail-line health-authorization-status">{{ selectedPersonName }}的授权状态：{{ authorization.active ? '已授权' : '已撤回' }}</text>
      <text v-if="healthMessage" class="health-message test-notice" aria-live="polite">{{ healthMessage }}</text>
    </view>

    <text v-if="message" class="health-message test-notice" aria-live="polite">{{ message }}</text>
  </view>
</template>

<style>
@import "../../styles/discovery.css";
.health-overview { padding: var(--space-5); border-radius: var(--radius-banner); background: var(--brand-mist); }
.health-eyebrow { display: block; color: var(--accent-secondary); font-size: var(--font-caption); font-weight: 600; line-height: 1.5; }
.health-overview .page-heading { margin-top: var(--space-2); }
.health-refresh { margin-top: var(--space-4); }
.health-summary-heading, .health-form-heading { margin-top: 0; }
.health-summary-heading:not(:first-child) { margin-top: var(--space-6); }
.health-line { margin-top: var(--space-2); }
.health-participant-picker { margin-top: var(--space-4); }
.health-current-person { margin-top: var(--space-3); font-weight: 600; }
.health-textarea { box-sizing: border-box; display: block; width: 100%; min-height: 96px; margin-top: var(--space-3); padding: var(--space-3); border: 1px solid var(--border-default); border-radius: var(--radius-control); background: var(--surface-primary); color: var(--text-primary); font-size: var(--font-body); line-height: 1.5; }
.health-authorize, .health-revoke { width: 100%; margin-top: var(--space-4); }
.health-revoke { margin-top: var(--space-3); }
.health-authorization-status { color: var(--accent-secondary); }
.health-message { margin-bottom: 0; }
</style>
