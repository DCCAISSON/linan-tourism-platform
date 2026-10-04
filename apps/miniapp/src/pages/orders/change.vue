<script setup lang="ts">
import { computed, reactive, ref } from "vue"
import { onLoad } from "@dcloudio/uni-app"
import { ApiError, createMiniappApi, type Grade, type OrderDetail, type SchoolClass } from "../../api"
import { createOrderChangeClient, orderChangeStatusLabels, type ChangeParticipantInput, type OrderChangeKind, type OrderChangeRequest } from "../../order-change-api"
import DiscoveryState from "../../components/DiscoveryState.vue"
import ProfileLoginSheet from "../../components/ProfileLoginSheet.vue"
import { type LoadState } from "../../enrollment-flow"

const api = createMiniappApi()
const changes = createOrderChangeClient()
const orderId = ref("")
const order = ref<OrderDetail | null>(null)
const schoolId = ref("")
const requests = ref<readonly OrderChangeRequest[]>([])
const refundLines = ref<readonly string[]>([])
const grades = ref<readonly Grade[]>([])
const classes = ref<readonly SchoolClass[]>([])
const state = ref<LoadState>("loading")
const error = ref("")
const notice = ref("")
const busy = ref(false)
const needsLogin = ref(false)
const loginVisible = ref(false)
const kind = ref<OrderChangeKind>("replacement")
const originalLineId = ref("")
const reason = ref("")
const editing = ref<OrderChangeRequest | null>(null)
const requestKey = ref("")
const person = reactive<{ displayName: string; participantKind: "student" | "adult"; gradeId: string; classId: string; identityNumber: string; phone: string }>({ displayName: "", participantKind: "student", gradeId: "", classId: "", identityNumber: "", phone: "" })
const participants = computed(() => order.value?.participants ?? [])
const originalName = computed(() => participants.value.find((row) => row.id === originalLineId.value)?.displayName ?? "请选择原参加人")
const gradeName = computed(() => grades.value.find((row) => row.id === person.gradeId)?.name ?? "请选择年级")
const className = computed(() => classes.value.find((row) => row.id === person.classId)?.name ?? "请选择班级")
const refundConflict = computed(() => kind.value === "addition" ? refundLines.value.length > 0 : refundLines.value.includes(originalLineId.value))
const personChanged = computed(() => {
  const before = editing.value?.proposedParticipant
  return before === undefined || person.displayName !== before.displayName || person.participantKind !== before.participantKind
    || person.gradeId !== (before.gradeId ?? "") || person.classId !== (before.classId ?? "") || person.identityNumber !== "" || person.phone !== ""
})
const canSubmit = computed(() => !busy.value && !refundConflict.value && reason.value.trim() !== "" && (kind.value === "addition" || originalLineId.value !== "")
  && (!personChanged.value || (person.displayName.trim() !== "" && person.identityNumber.trim() !== "" && person.phone.trim() !== "" && (person.participantKind === "adult" || (person.gradeId !== "" && person.classId !== "")))))

onLoad((query) => { orderId.value = query?.["orderId"] ?? ""; void load() })

async function load(): Promise<void> {
  state.value = "loading"; error.value = ""; needsLogin.value = false
  try {
    const [detail, result] = await Promise.all([api.getOrderDetail(orderId.value), changes.list(orderId.value)])
    order.value = detail; schoolId.value = result.schoolId; requests.value = result.requests; refundLines.value = result.activeRefundLineIds
    grades.value = await api.listGrades(result.schoolId)
    state.value = "ready"
    if (requestKey.value === "") requestKey.value = `order-change:${Date.now()}:${Math.random().toString(36).slice(2)}`
  } catch (cause) {
    state.value = "error"; needsLogin.value = cause instanceof ApiError && (cause.statusCode === 401 || cause.statusCode === 403)
    error.value = needsLogin.value ? "请先使用已验证手机号登录，再查看人员变更申请" : cause instanceof Error ? cause.message : "申请记录暂时无法读取，请重试"
  }
}

async function chooseGrade(event: { readonly detail: { readonly value: string | number } }): Promise<void> {
  person.gradeId = grades.value[Number(event.detail.value)]?.id ?? ""; person.classId = ""; classes.value = []
  try { if (person.gradeId !== "") classes.value = await api.listClasses(person.gradeId) }
  catch (cause) { error.value = cause instanceof Error ? cause.message : "班级加载失败，请重新选择年级" }
}

async function beginSupplement(item: OrderChangeRequest): Promise<void> {
  editing.value = item; kind.value = item.kind; originalLineId.value = item.originalLineId ?? ""; reason.value = item.reason
  Object.assign(person, { displayName: item.proposedParticipant.displayName, participantKind: item.proposedParticipant.participantKind, gradeId: item.proposedParticipant.gradeId ?? "", classId: item.proposedParticipant.classId ?? "", identityNumber: "", phone: "" })
  try { classes.value = person.gradeId === "" ? [] : await api.listClasses(person.gradeId); uni.pageScrollTo({ scrollTop: 0, duration: 0 }) }
  catch (cause) { error.value = cause instanceof Error ? cause.message : "班级加载失败，请重试" }
}

function resetForm(): void {
  editing.value = null; reason.value = ""; originalLineId.value = ""; requestKey.value = `order-change:${Date.now()}:${Math.random().toString(36).slice(2)}`
  Object.assign(person, { displayName: "", participantKind: "student", gradeId: "", classId: "", identityNumber: "", phone: "" })
}

function participantInput(): ChangeParticipantInput {
  return { displayName: person.displayName, participantKind: person.participantKind, identityNumber: person.identityNumber, phone: person.phone,
    ...(person.participantKind === "student" ? { schoolId: schoolId.value, gradeId: person.gradeId, classId: person.classId } : {}) }
}

function formatDate(value: string): string { return new Date(value).toLocaleString("zh-CN", { hour12: false }) }

async function submit(): Promise<void> {
  if (!canSubmit.value) return
  busy.value = true; error.value = ""; notice.value = ""
  try {
    if (editing.value === null) await changes.submit(orderId.value, { kind: kind.value, originalLineId: kind.value === "replacement" ? originalLineId.value : null, participant: participantInput(), reason: reason.value, idempotencyKey: requestKey.value })
    else await changes.supplement(orderId.value, editing.value.id, { expectedVersion: editing.value.version, reason: reason.value, ...(personChanged.value ? { participant: participantInput() } : {}) })
    resetForm(); await load()
    notice.value = "申请已提交，待工作人员核对费用和保险并办理变更。"
  } catch (cause) { error.value = cause instanceof Error ? cause.message : "提交失败，请重试" }
  finally { busy.value = false }
}

async function withdraw(item: OrderChangeRequest): Promise<void> {
  if (busy.value) return
  busy.value = true; error.value = ""
  try { await changes.withdraw(orderId.value, item.id, item.version); if (editing.value?.id === item.id) resetForm(); await load(); notice.value = "申请已撤回。" }
  catch (cause) { error.value = cause instanceof Error ? cause.message : "撤回失败，请重试" }
  finally { busy.value = false }
}
</script>

<template>
  <view class="discovery-page change-page">
    <ProfileLoginSheet v-if="loginVisible" @completed="loginVisible = false; load()" @cancelled="loginVisible = false" />
    <text class="page-heading">人员变更申请</text>
    <DiscoveryState :state="state" :message="error" @retry="load" />
    <button v-if="needsLogin" class="button-primary action-gap" @tap="loginVisible = true">使用手机号登录</button>
    <view v-if="state === 'ready' && order">
      <view class="info-card">
        <text class="card-title">{{ order.activityTitle }}</text><text class="detail-line">订单号：{{ order.code }}</text>
        <text class="body-secondary">提交申请后，工作人员将联系您核对费用和保险，再办理人员变更。</text>
      </view>
      <text v-if="notice" class="test-notice" role="status">{{ notice }}</text>
      <text v-if="error" class="change-error" role="alert">{{ error }}</text>
      <view v-if="order.status === 'paid'" class="info-card">
        <text class="card-title">{{ editing ? '补充申请材料' : '提交申请' }}</text>
        <text v-if="editing" class="body-secondary">只补充原因可直接提交；修改拟参加人信息时，请重新填写证件号码和手机号。</text>
        <view v-if="!editing" class="change-options">
          <button :class="kind === 'replacement' ? 'button-primary' : 'button-secondary'" @tap="kind = 'replacement'">换人</button>
          <button :class="kind === 'addition' ? 'button-primary' : 'button-secondary'" @tap="kind = 'addition'">增补人员</button>
        </view>
        <view v-if="kind === 'replacement'" class="change-field"><text>原参加人</text>
          <picker :disabled="editing !== null" mode="selector" :range="participants" range-key="displayName" @change="originalLineId = participants[Number($event.detail.value)]?.id ?? ''"><view class="change-control">{{ originalName }}</view></picker>
        </view>
        <text v-if="refundConflict" class="change-error">{{ kind === 'addition' ? '本订单有退款正在处理，处理结束后可申请增补。' : '所选人员有退款正在处理，处理结束后可申请换人。' }}</text>
        <text class="detail-line">{{ kind === 'replacement' ? '拟替换为' : '拟增补人员' }}</text>
        <label class="change-field"><text>姓名</text><input v-model="person.displayName" class="change-control" maxlength="120" placeholder="请填写拟参加人的姓名" /></label>
        <view class="change-field"><text>参加人类型</text><radio-group class="change-options" @change="person.participantKind = $event.detail.value === 'adult' ? 'adult' : 'student'"><label><radio value="student" :checked="person.participantKind === 'student'" />学生</label><label><radio value="adult" :checked="person.participantKind === 'adult'" />成人</label></radio-group></view>
        <view v-if="person.participantKind === 'student'">
          <text class="detail-line">学校：{{ order.schoolName }}</text>
          <view class="change-field"><text>年级</text><picker mode="selector" :range="grades" range-key="name" @change="chooseGrade"><view class="change-control">{{ gradeName }}</view></picker></view>
          <view class="change-field"><text>班级</text><picker mode="selector" :range="classes" range-key="name" :disabled="classes.length === 0" @change="person.classId = classes[Number($event.detail.value)]?.id ?? ''"><view class="change-control">{{ className }}</view></picker></view>
        </view>
        <label class="change-field"><text>身份证号码</text><input v-model="person.identityNumber" class="change-control" maxlength="18" placeholder="用于工作人员核对参加人与保险" /></label>
        <label class="change-field"><text>手机号</text><input v-model="person.phone" class="change-control" type="number" maxlength="11" placeholder="拟参加人的联系手机号" /></label>
        <label class="change-field"><text>{{ editing ? '补充说明及申请原因' : '申请原因' }}</text><textarea v-model="reason" class="change-control change-reason" maxlength="255" placeholder="请说明需要换人或增补的原因" /></label>
        <button class="button-primary action-gap" :disabled="!canSubmit" @tap="submit">{{ busy ? '提交中' : editing ? '提交补充材料' : '提交人员变更申请' }}</button>
        <button v-if="editing" class="button-secondary action-gap" :disabled="busy" @tap="resetForm">取消补充</button>
      </view>
      <view v-else class="info-card"><text class="body-secondary">只有已付款订单可提交人员变更申请。</text></view>
      <text class="section-heading">申请记录</text>
      <view v-if="requests.length === 0" class="info-card"><text class="body-secondary">暂无人员变更申请</text></view>
      <view v-for="item in requests" :key="item.id" class="info-card">
        <text class="card-title">{{ orderChangeStatusLabels[item.status] }}</text>
        <text class="detail-line">{{ item.kind === 'replacement' ? '换人' : '增补' }}：{{ item.proposedParticipant.displayName }}</text>
        <text v-if="item.originalLineId" class="body-secondary">原参加人：{{ item.originalSnapshot.lines.find(line => line.id === item.originalLineId)?.displayName }}</text>
        <text class="body-secondary">证件：{{ item.proposedParticipant.identityNumberMasked }} · 手机：{{ item.proposedParticipant.phoneMasked }}</text>
        <text class="detail-line">申请原因：{{ item.reason }}</text>
        <text v-if="item.status === 'approved'" class="body-secondary">审核已通过，待工作人员办理人员变更。</text>
        <view v-for="entry in item.history" :key="entry.version" class="change-history"><text class="body-secondary">{{ entry.actorName }} · {{ formatDate(entry.at) }} · {{ orderChangeStatusLabels[entry.status] }}</text><text class="detail-line">{{ entry.note }}</text></view>
        <button v-if="item.status === 'needs_information'" class="button-primary action-gap" :disabled="busy" @tap="beginSupplement(item)">补充材料</button>
        <button v-if="item.status === 'submitted' || item.status === 'needs_information'" class="button-secondary action-gap" :disabled="busy" @tap="withdraw(item)">撤回申请</button>
      </view>
    </view>
  </view>
</template>

<style>
@import "../../styles/discovery.css";
.change-field { display: block; margin-top: var(--space-4); color: var(--text-primary); font-size: var(--font-body-sm); line-height: 1.5; }
.change-control { display: block; box-sizing: border-box; width: 100%; min-height: var(--size-touch-target); height: auto; margin-top: var(--space-2); padding: var(--space-3); border: 1px solid var(--border-default); border-radius: var(--radius-control); background: var(--surface-primary); color: var(--text-primary); font-size: var(--font-body); line-height: 1.5; }
.change-reason { min-height: calc(var(--size-touch-target) * 2); }
.change-options { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-top: var(--space-3); }
.change-options > button { flex: 1; }
.change-options > label { display: flex; align-items: center; min-height: var(--size-touch-target); }
.change-error { display: block; margin-top: var(--space-4); color: var(--status-error); font-size: var(--font-body-sm); line-height: 1.6; }
.change-history { margin-top: var(--space-3); padding-top: var(--space-2); border-top: 1px solid var(--border-subtle); }
.change-control:focus-within { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
</style>
