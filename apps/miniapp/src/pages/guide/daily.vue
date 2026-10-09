<script setup lang="ts">
import { computed, ref } from "vue"
import { onHide, onLoad, onShow, onUnload } from "@dcloudio/uni-app"
import { createStaffApi } from "../../staff-api"
import { getStaffSessionToken } from "../../staff-session"
import { createGuideApi, type PersonRef } from "../../guide-execution-api"
import { createGuideDailyApi, dailyMealOptions, dailyMeals } from "../../guide-daily-api"
import { useGuideDaily } from "../../guide-daily-state"
import DailyHistory from "./DailyHistory.vue"

const sessionId = ref("")
const { state, people, person, report, startsOn, endsOn, healthReadable, canWrite, canPublish, busy, load, clear, select, save, approve, loadHistory } = useGuideDaily({ api: createGuideDailyApi(), getSession: createGuideApi().getSession, me: createStaffApi().me, token: getStaffSessionToken, login: () => { uni.redirectTo({ url: "/pages/guide/index" }) } })
const count = computed(() => state.reports.filter(row => row.reportDate === state.form.reportDate).length)
const saveReady = computed(() => canWrite.value && (!report.value || !!state.form.correctionReason.trim()))
function status(personRef: PersonRef): string {
  const row = state.reports.find(item => item.personRef === personRef && item.reportDate === state.form.reportDate)
  return row ? row.publicApproved ? "已记录 · 摘要已批准" : "已记录 · 摘要待审批" : "尚无日报"
}
function back(): void { uni.navigateBack({ delta: 1, fail: () => { uni.redirectTo({ url: `/pages/guide/session?id=${encodeURIComponent(sessionId.value)}` }) } }) }
onLoad(query => { sessionId.value = typeof query?.["id"] === "string" ? query["id"] : "" })
onShow(() => { void load(sessionId.value) })
onHide(clear)
onUnload(clear)
</script>

<template>
  <view class="guide-page">
    <view class="guide-header"><text class="guide-title">参加人日报</text><button class="guide-secondary" :disabled="state.saving" @tap="back">返回执行</button></view>
    <view v-if="state.loading" class="guide-section" role="status"><text>正在核对人员与日报…</text></view>
    <view v-if="state.error" class="guide-section" role="alert"><text class="guide-error">{{ state.error }}</text><button class="guide-secondary" :disabled="busy" @tap="load(sessionId)">刷新重试</button></view>
    <text v-if="state.notice" class="guide-success" role="status">{{ state.notice }}</text>
    <template v-if="state.session">
      <view class="guide-section">
        <text class="guide-subtitle">{{ state.session.code }}</text>
        <text class="guide-muted">{{ startsOn }} 至 {{ endsOn }} · 逐人记录每天情况</text>
        <button class="guide-secondary" :disabled="busy" @tap="load(sessionId)">刷新日报与授权</button>
        <text v-if="state.session.confirmationStatus !== 'current'" class="guide-warning">人车安排尚未确认或已变化，重新确认后可填写日报。</text>
        <text v-else-if="!state.permissions.includes('execution.write')" class="guide-muted">当前账号可查看日报，无填写权限。</text>
        <label class="guide-field"><text>记录日期（北京时间）</text><picker mode="date" :value="state.form.reportDate" :start="startsOn" :end="endsOn" :disabled="busy" @change="select(state.personRef, $event.detail.value)"><view class="guide-picker">{{ state.form.reportDate }} · 点击选择</view></picker></label>
      </view>
      <view class="guide-section">
        <text class="guide-subtitle">本车人员 · 当日已记录 {{ count }} / {{ people.length }}</text>
        <text v-if="!people.length" class="guide-muted">暂无本人所带车辆内的人员，请返回团期核对分配。</text>
        <view v-for="row in people" :key="row.personRef" class="guide-person-row">
          <view class="guide-person"><text class="guide-person-name">{{ row.displayName }}</text><text class="guide-muted">{{ row.className || '班级未填写' }} · {{ status(row.personRef) }}</text><text v-if="!row.active" class="guide-warning">{{ row.inactiveReason || '当前不可填写' }}</text></view>
          <button :class="['guide-choice', { selected: state.personRef === row.personRef }]" :disabled="busy" @tap="select(row.personRef, state.form.reportDate)">{{ state.personRef === row.personRef ? '已选' : '查看 / 填写' }}</button>
        </view>
      </view>
      <view v-if="person" class="guide-section">
        <text class="guide-subtitle">{{ person.displayName }} · {{ state.form.reportDate }}</text>
        <text class="guide-muted">{{ report ? '已有日报 · 版本 ' + report.version : '当日尚无日报' }}{{ report ? report.publicApproved ? ' · 摘要已批准' : ' · 摘要待审批' : '' }}</text>
        <text v-if="!person.active" class="guide-warning">该人员当前不可填写，可查看已有记录。</text>
        <text v-if="report?.lodgingCheck" class="guide-note">历史住宿综合记录：{{ report.lodgingCheck }}</text>
        <text v-if="report?.mealStatus" class="guide-note">历史餐饮综合记录：{{ report.mealStatus }}</text>
        <text class="guide-muted">三餐分别记录；“未记录”不表示未用餐。计划内的餐次和查房请在执行节点中记录。</text>
        <view class="guide-form" aria-label="个人日报表单">
          <view v-for="meal in dailyMeals" :key="meal.key" class="guide-field">
            <text>{{ meal.label }}</text>
            <view class="guide-actions"><button v-for="option in dailyMealOptions" :key="option.label" :class="['guide-choice', { selected: state.form[meal.key] === option.value }]" :disabled="busy || !canWrite" @tap="state.form[meal.key] = option.value">{{ state.form[meal.key] === option.value ? '已选 · ' : '' }}{{ option.label }}</button></view>
            <label class="guide-field"><text>{{ meal.label }}情况或理由（选填）</text><textarea v-model="state.form[meal.note]" :disabled="busy || !canWrite" maxlength="4000" placeholder="记录当餐情况或不适用原因" /></label>
          </view>
          <template v-if="healthReadable">
            <label class="guide-field"><text>身体情况（仅授权人员可见）</text><textarea v-model="state.form.bodyStatus" :disabled="busy || !canWrite" maxlength="4000" placeholder="填写当日身体情况" /></label>
            <label class="guide-field"><text>私人备注（仅授权人员可见）</text><textarea v-model="state.form.note" :disabled="busy || !canWrite" maxlength="4000" placeholder="填写需交接的私人事项" /></label>
          </template>
          <text v-else class="guide-muted">身体情况与私人备注需健康读取权限及有效家属授权，此处不展示。保存餐饮记录会保留已有私密内容。</text>
          <label v-if="report && canWrite" class="guide-field"><text>更正原因</text><textarea v-model="state.form.correctionReason" :disabled="busy" maxlength="1000" placeholder="说明本次更正原因，原记录会保留" /></label>
          <button v-if="canWrite" class="guide-primary" :loading="state.saving" :disabled="busy || !saveReady" @tap="save">{{ report ? '保存更正' : '保存个人日报' }}</button>
        </view>
        <template v-if="report">
          <text v-if="report.publicApproved" class="guide-note">已批准的公开摘要：{{ report.publicSummary }}</text>
          <text v-else class="guide-muted">公开摘要待审批，批准后家属可查看。</text>
          <button class="guide-secondary" :loading="state.historyLoading" :disabled="busy" @tap="loadHistory">查看日报历史</button>
          <view v-if="canPublish" class="guide-form">
            <label class="guide-field"><text>给本订单家属的公开摘要</text><textarea v-model="state.summary" :disabled="busy" maxlength="1000" placeholder="填写适合家属查看的摘要" /></label>
            <button class="guide-primary" :disabled="busy || !state.summary.trim()" @tap="approve">批准公开摘要</button>
          </view>
        </template>
      </view>
      <DailyHistory v-if="state.historyLoaded" :rows="state.history" />
    </template>
  </view>
</template>

<style>
@import "../../guide-execution.css";
</style>
