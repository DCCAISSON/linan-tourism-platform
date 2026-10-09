<script setup lang="ts">
import { computed, ref } from "vue"
import { onHide, onLoad, onShow, onUnload } from "@dcloudio/uni-app"
import { createStaffApi } from "../../staff-api"
import { getStaffSessionToken } from "../../staff-session"
import { createGuideApi } from "../../guide-execution-api"
import { createGuideEvaluationsApi } from "../../guide-evaluations-api"
import { useGuideEvaluations } from "../../guide-evaluations-state"

const sessionId = ref("")
const { state, load, clear, edit, selectStandard, save, confirm } = useGuideEvaluations({ api: createGuideEvaluationsApi(), getSession: createGuideApi().getSession, me: createStaffApi().me, token: getStaffSessionToken, login: () => { uni.redirectTo({ url: "/pages/guide/index" }) } })
const busy = computed(() => state.loading || state.saving)
const students = computed(() => state.dashboard?.students.map(student => ({ ...student, evaluation: state.dashboard?.evaluations.find(row => row.personRef === student.personRef) })) ?? [])
const ungraded = computed(() => students.value.filter(student => student.evaluation?.gradeCode == null).length)
const standards = computed(() => state.dashboard?.standards.filter(standard => standard.confirmedAt !== null) ?? [])
const activeStandard = computed(() => standards.value.find(standard => standard.id === state.form?.standardId))
const standardChoices = computed(() => [{ id: "", title: "仅内部观察" }, ...standards.value.map(standard => ({ id: standard.id, title: `${standard.title}（版本 ${standard.version}）` }))])
const standardIndex = computed(() => Math.max(0, standardChoices.value.findIndex(standard => standard.id === state.form?.standardId)))
onLoad(query => { sessionId.value = typeof query?.["id"] === "string" ? query["id"] : "" })
onShow(() => { void load(sessionId.value) })
onHide(clear)
onUnload(clear)
function back(): void { uni.navigateBack({ delta: 1, fail: () => { uni.redirectTo({ url: `/pages/guide/session?id=${encodeURIComponent(sessionId.value)}` }) } }) }
function changeStandard(event: { detail: { value: string | number } }): void { const standard = standardChoices.value[Number(event.detail.value)]; if (standard) selectStandard(standard.id) }
function observationLabel(standardId: string | null, code: string): string { return state.dashboard?.standards.find(standard => standard.id === standardId)?.dimensions.find(dimension => dimension.code === code)?.label ?? "观察项目" }
async function askConfirm(): Promise<void> {
  if (busy.value || !state.canConfirm || !state.group || state.form || state.group.ungraded > 0 || state.group.pending === 0) return
  const turn = state.generation
  const token = getStaffSessionToken()
  const total = state.group.total
  const approved = await new Promise<boolean>(resolve => uni.showModal({ title: "确认全团评价", content: `将确认本团期全团 ${total} 名学生的人工 A/B 评价（含其他车辆），学校随后可查看已确认等级。是否继续？`, confirmText: "确认全团", success: result => resolve(result.confirm), fail: () => resolve(false) }))
  if (state.generation === turn && getStaffSessionToken() === token) await confirm(approved)
}
</script>

<template>
  <view class="guide-page">
    <view class="guide-header"><text class="guide-title">学生评价</text><button class="guide-secondary" :disabled="state.saving" @tap="back">返回团期</button></view>
    <view v-if="state.loading" class="guide-section" role="status"><text>正在核对学生名单与评价…</text></view>
    <view v-if="state.error" class="guide-section" role="alert"><text class="guide-error">{{ state.error }}</text><button class="guide-secondary" :disabled="busy" @tap="load(sessionId)">刷新核对</button></view>
    <text v-if="state.notice" class="guide-success" role="status">{{ state.notice }}</text>
    <template v-if="state.session && state.dashboard">
      <view class="guide-section">
        <text class="guide-subtitle">{{ state.session.code }} · 本车学生</text>
        <text>应评 {{ students.length }} 人 · 已评级 {{ students.length - ungraded }} 人 · 未评级 {{ ungraded }} 人</text>
        <text class="guide-muted">请逐人按实际表现选择等级，未选择保持未评级。内部观察和标记不进入学校报告。</text>
        <button class="guide-secondary" :disabled="busy" @tap="load(sessionId)">刷新名单与评价</button>
      </view>
      <view v-if="state.session.confirmationStatus !== 'current'" class="guide-section guide-warning">人车安排{{ state.session.confirmationStatus === 'stale' ? '已变化' : '尚未确认' }}，请联系工作人员确认后填写。</view>
      <text v-else-if="!state.canWrite" class="guide-muted">当前账号可查看评价，无填写权限。</text>
      <view v-if="state.form && state.canWrite" class="guide-section">
        <text class="guide-subtitle">评价：{{ state.form.displayName }}</text>
        <view class="guide-form">
          <view class="guide-field"><text>评价标准</text><picker :range="standardChoices" range-key="title" :value="standardIndex" :disabled="busy || state.form.previous?.standardId != null" @change="changeStandard"><view class="guide-picker">{{ standardChoices[standardIndex]?.title }}</view></picker></view>
          <text v-if="!activeStandard" class="guide-muted">未选择已确认标准，可先保存内部观察。</text>
          <text v-for="item in activeStandard?.items" :key="item.code" class="guide-muted">{{ item.code }} · {{ item.label }}：{{ item.description }}</text>
          <text>人工评级</text>
          <view class="guide-actions">
            <button :class="['guide-choice', { selected: state.form.gradeCode === null }]" :disabled="busy" @tap="state.form.gradeCode = null">{{ state.form.gradeCode === null ? '已选 · ' : '' }}未评级</button>
            <button v-for="item in activeStandard?.items" :key="item.code" :class="['guide-choice', { selected: state.form.gradeCode === item.code }]" :disabled="busy" @tap="state.form.gradeCode = item.code">{{ state.form.gradeCode === item.code ? '已选 · ' : '' }}{{ item.code }} · {{ item.label }}</button>
          </view>
          <label class="guide-field"><text>内部观察</text><input v-model="state.form.internalComment" :maxlength="500" :disabled="busy" placeholder="记录学生的实际表现" /></label>
          <label v-for="dimension in state.form.dimensions" :key="dimension.code" class="guide-field"><text>{{ dimension.label }}（可选）</text><text v-if="dimension.description" class="guide-muted">{{ dimension.description }}</text><input v-model="dimension.observation" :maxlength="500" :disabled="busy" placeholder="填写观察事实" /></label>
          <text v-if="state.form.dimensions.length" class="guide-muted">逐项观察不会自动换算等级。</text>
          <view class="guide-actions">
            <button :class="['guide-choice', { selected: state.form.excellent }]" :disabled="busy" @tap="state.form.excellent = !state.form.excellent">优秀标记：{{ state.form.excellent ? '已选' : '未选' }}</button>
            <button :class="['guide-choice', { selected: state.form.attention }]" :disabled="busy" @tap="state.form.attention = !state.form.attention">关注标记：{{ state.form.attention ? '已选' : '未选' }}</button>
          </view>
          <text class="guide-muted">保存后，此学生的评价需由授权人员重新确认。</text>
          <view class="guide-actions"><button class="guide-primary" :disabled="busy" @tap="save">{{ state.saving ? '正在保存…' : '保存当前学生评价' }}</button><button class="guide-secondary" :disabled="busy" @tap="state.form = null">取消修改</button></view>
        </view>
      </view>
      <view class="guide-section">
        <text class="guide-subtitle">本车评价记录</text>
        <text v-if="!students.length" class="guide-muted">本车暂无可评价学生，请核对人员安排。</text>
        <view v-for="student in students" :key="student.personRef" class="guide-row">
          <view class="guide-person-row"><view class="guide-person"><text class="guide-person-name">{{ student.displayName }}</text><text class="guide-muted">{{ student.gradeName || '年级未填写' }} · {{ student.className || '班级未填写' }}</text></view><button v-if="state.canWrite" class="guide-secondary" :disabled="busy" @tap="edit(student.personRef)">{{ student.evaluation ? '修改评价' : '填写评价' }}</button></view>
          <text>{{ student.evaluation?.gradeCode ? `${student.evaluation.gradeCode} · ${student.evaluation.gradeLabel}` : '未评级' }} · {{ student.evaluation?.confirmedAt ? '已确认' : '未确认' }}</text>
          <text v-if="student.evaluation?.excellent || student.evaluation?.attention" class="guide-muted">{{ student.evaluation?.excellent ? '优秀标记' : '' }} {{ student.evaluation?.attention ? '关注标记' : '' }}</text>
          <text v-if="student.evaluation?.internalComment" class="guide-note">内部观察：{{ student.evaluation.internalComment }}</text>
          <template v-if="student.evaluation"><text v-for="observation in student.evaluation.dimensionObservations" :key="observation.code" class="guide-note guide-muted">{{ observationLabel(student.evaluation.standardId, observation.code) }}：{{ observation.observation }}</text></template>
        </view>
      </view>
      <view v-if="state.canConfirm && state.group" class="guide-section">
        <text class="guide-subtitle">全团评价确认</text>
        <text>全团 {{ state.group.total }} 人 · 未评级 {{ state.group.ungraded }} 人 · 待确认 {{ state.group.pending }} 人</text>
        <text class="guide-muted">此操作包含全团所有车辆。全团学生均已人工评级后，授权人员可确认，学校仅获取已确认等级。</text>
        <text v-if="state.form" class="guide-muted">请先保存或取消当前修改。</text>
        <button class="guide-primary" :disabled="busy || !!state.form || state.group.ungraded > 0 || state.group.pending === 0" @tap="askConfirm">{{ state.saving ? '正在处理…' : '确认全团评价' }}</button>
      </view>
    </template>
  </view>
</template>

<style>
@import "../../guide-execution.css";
</style>
