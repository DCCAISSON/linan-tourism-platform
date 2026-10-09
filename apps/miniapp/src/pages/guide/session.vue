<script setup lang="ts">
import { computed, ref } from "vue"
import { onHide, onLoad, onShow, onUnload } from "@dcloudio/uni-app"
import { createStaffApi } from "../../staff-api"
import { getStaffSessionToken } from "../../staff-session"
import { createGuideApi } from "../../guide-execution-api"
import { chinaDate, useGuideExecution } from "../../guide-execution-state"
import ExecutionNodes from "./ExecutionNodes.vue"
import EventRecords from "./EventRecords.vue"

const sessionId = ref("")
const tab = ref<"attendance" | "records" | "group">("attendance")
const { state, load, clear, saveOccurrence, createEvent } = useGuideExecution({ api: createGuideApi(), me: createStaffApi().me, token: getStaffSessionToken, login: () => { uni.redirectTo({ url: "/pages/guide/index" }) } })
const vehicles = computed(() => state.session?.vehicles.filter(vehicle => state.session?.vehicleIds.includes(vehicle.id)) ?? [])
const busy = computed(() => state.loading || state.saving)
onLoad(query => { sessionId.value = typeof query?.["id"] === "string" ? query["id"] : "" })
onShow(() => { void load(sessionId.value) })
onHide(clear)
onUnload(clear)
function back(): void { uni.redirectTo({ url: "/pages/guide/index" }) }
function changeTab(value: "attendance" | "records" | "group"): void { if (value !== tab.value) { state.selection = null; tab.value = value } }
</script>

<template>
  <view class="guide-page">
    <view class="guide-header"><text class="guide-title">出团执行</text><button class="guide-secondary" :disabled="state.saving" @tap="back">返回团期</button></view>
    <view v-if="state.loading" class="guide-section" role="status"><text>正在核对团期与分配…</text></view>
    <view v-if="state.error" class="guide-section" role="alert"><text class="guide-error">{{ state.error }}</text><button class="guide-secondary" :disabled="busy" @tap="load(sessionId)">刷新重试</button></view>
    <text v-if="state.notice" class="guide-success" role="status">{{ state.notice }}</text>
    <template v-if="state.session && state.nodes">
      <view class="guide-section"><text class="guide-subtitle">{{ state.session.code }}</text><text class="guide-muted">{{ chinaDate(state.session.startsAt) }} 至 {{ chinaDate(state.session.endsAt) }}</text><text>{{ vehicles.length ? vehicles.map(vehicle => `${vehicle.sequence}号车${vehicle.plateNumber ? ' · ' + vehicle.plateNumber : ''}`).join('；') : '尚未分配所带车辆' }}</text><button class="guide-secondary" :disabled="busy" @tap="load(sessionId)">刷新名单与记录</button></view>
      <view v-if="state.session.confirmationStatus !== 'current'" class="guide-warning guide-section">{{ state.session.confirmationStatus === 'stale' ? '人车安排已变化，重新确认后可继续填写。' : '人车安排尚未确认，确认后可开始填写。' }}</view>
      <text v-else-if="!state.canWrite" class="guide-muted">当前账号可查看记录，无填写权限。</text>
      <view class="guide-tabs" role="tablist"><button :class="['guide-tab', { selected: tab === 'attendance' }]" :disabled="busy" @tap="changeTab('attendance')">本车点名</button><button :class="['guide-tab', { selected: tab === 'records' }]" :disabled="busy" @tap="changeTab('records')">执行记录</button><button :class="['guide-tab', { selected: tab === 'group' }]" :disabled="busy" @tap="changeTab('group')">全团只读</button></view>
      <template v-if="tab !== 'group'">
        <ExecutionNodes :key="`${state.generation}:${tab}`" :session="state.session" :data="state.nodes" :selection="state.selection" :attendance="tab === 'attendance'" :can-write="state.canWrite" :busy="busy" @select="state.selection = $event" @save="saveOccurrence" />
        <EventRecords v-if="tab === 'records'" :key="state.generation" :session="state.session" :can-write="state.canWrite" :busy="busy" @save="createEvent" />
      </template>
      <view v-else class="guide-section"><text class="guide-subtitle">全团名单 · 只读</text><text class="guide-muted">{{ state.session.groupPeople.length }}人；填写请返回本人所带车辆。</text><text v-if="!state.session.groupPeople.length" class="guide-muted">暂无已确认的全团名单。</text><view v-for="person in state.session.groupPeople" :key="person.personRef" class="guide-row"><text class="guide-person-name">{{ person.displayName }}</text><text class="guide-muted">{{ person.vehicleSequence ? person.vehicleSequence + '号车' : '车辆未标注' }} · {{ person.className || '班级未填写' }}</text></view></view>
    </template>
  </view>
</template>

<style>
@import "../../guide-execution.css";
</style>
