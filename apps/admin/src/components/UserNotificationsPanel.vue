<template>
  <section class="notifications-panel user-messages" aria-labelledby="user-messages-title">
    <div class="notifications-section-heading"><div><h3 id="user-messages-title">用户消息 · 新活动提醒</h3><p>面向主动订阅的用户，无需选择订单或团期。每次订阅仅可使用一次。</p></div><button type="button" :disabled="busy" @click="load">刷新用户消息</button></div>
    <p v-if="busy" role="status">正在处理…</p>
    <p v-if="error" class="notifications-feedback--error" role="alert">{{ error }}</p>
    <p v-if="message" class="notifications-feedback" role="status">{{ message }}</p>
    <p v-if="access && !canRead" class="notifications-empty">用户消息需要全局数据范围和通知查看权限。你可在下方处理权限范围内的团期通知。</p>
    <template v-if="canRead && loaded">
      <p v-if="templates.length === 0" class="notifications-empty">尚未配置可用的微信订阅消息模板，请联系管理员完成配置。</p>
      <form v-else class="notifications-form-grid" @submit.prevent="createTask">
        <label class="notifications-field-wide">消息模板<select v-model="templateId" :disabled="busy" required @change="resetDraft"><option value="">请选择消息模板</option><option v-for="item in templates" :key="item.id" :value="item.id">{{ item.title }}</option></select></label>
        <template v-if="selectedTemplate">
          <label v-for="field in selectedTemplate.fields" :key="field.key">{{ field.label }}<input v-model.trim="payload[field.key]" :disabled="busy || !canWrite" required :maxlength="field.rule === 'thing' ? 20 : undefined" :inputmode="field.rule === 'number' ? 'decimal' : 'text'" /><small>{{ fieldHint[field.rule] }}</small></label>
          <p class="notifications-field-wide">点击消息后进入小程序“研学活动”页面。</p>
          <button type="button" :disabled="busy" @click="previewSubscribers">预览可用订阅</button>
          <div v-if="preview" class="notifications-field-wide"><p>可用订阅 {{ preview.eligibleCount }} 条，已选 {{ selectedIds.length }} 条。</p>
            <p v-if="preview.subscribers.length === 0" class="notifications-empty">暂无可用订阅，请等待用户主动订阅。</p>
            <template v-else><label class="notifications-check"><input type="checkbox" :checked="selectedIds.length === preview.subscribers.length" :disabled="busy || !canWrite" @change="toggleAll" />选择全部可用订阅</label><div class="user-subscribers"><label v-for="subscriber in preview.subscribers" :key="subscriber.id" class="notifications-check"><input v-model="selectedIds" :value="subscriber.id" type="checkbox" :disabled="busy || !canWrite" />订阅编号 {{ subscriber.id }}</label></div></template>
          </div>
          <button v-if="canWrite" type="submit" :disabled="busy || selectedIds.length === 0">创建用户消息任务</button><p class="notifications-empty">创建任务后不会自动发送。</p>
        </template>
      </form>
      <div class="notifications-detail"><h4>近期用户消息任务</h4><p v-if="tasks.length === 0" class="notifications-empty">暂无用户消息任务。</p><div v-else class="notifications-task-list"><button v-for="task in tasks" :key="task.id" type="button" :disabled="busy" :class="{ 'is-active': detail?.task.id === task.id }" @click="loadTask(task.id)"><span>{{ task.payloadSnapshot.title }}</span><strong>{{ taskLabels[task.status] }}</strong><small>{{ task.createdAt }} · {{ task.id }}</small></button></div></div>
      <div v-if="detail" class="notifications-detail">
        <h4>用户消息任务 {{ detail.task.id }}</h4><p>{{ detail.task.payloadSnapshot.title }} · {{ taskLabels[detail.task.status] }}</p>
        <p v-for="(field, key) in detail.task.payloadSnapshot.data" :key="key">{{ fieldLabel(detail.task.templateId, String(key)) }}：{{ field.value }}</p>
        <p>接收订阅：{{ detail.targets.length }} 条</p><p>跳转页面：{{ detail.task.payloadSnapshot.page ?? '小程序首页' }}</p>
        <p class="notifications-notice">“接口已受理”不代表送达或已读。结果未知的目标不会自动重发。</p>
        <div class="user-subscribers"><p v-for="target in detail.targets" :key="target.id">订阅编号 {{ target.subscriptionId }} · {{ statusLabels[target.status] }}</p></div>
        <p v-if="detail.attempts.length === 0" class="notifications-empty">尚无发送尝试。</p><p v-for="attempt in detail.attempts" :key="attempt.id">{{ attempt.targetId }} · {{ statusLabels[attempt.status] }}{{ attempt.errorCode ? `（${attempt.errorCode}）` : '' }}</p>
        <template v-if="canSend && detail.task.status === 'pending'">
          <button v-if="confirmationId !== detail.task.id" type="button" :disabled="busy" @click="prepareSend">核对任务并准备发送</button>
          <div v-else class="notifications-notice"><p>即将发送任务 {{ confirmationId }}，共 {{ detail.targets.length }} 条订阅，请核对上方消息内容。</p><label class="notifications-check"><input v-model="confirmed" type="checkbox" :disabled="busy" />我已核对本任务内容和接收范围，确认实际发送</label><button type="button" :disabled="busy || !confirmed" @click="sendTask">确认发送此任务</button><button type="button" :disabled="busy" @click="clearConfirmation">取消发送</button></div>
        </template>
      </div>
    </template>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { getCurrentStaff } from "@/api/auth"
import type { StaffAccess } from "@/api/auth"
import { createUserMessageTask, getUserMessageTask, getUserMessageTasks, getUserMessageTemplates, previewUserMessages, sendUserMessageTask } from "@/api/user-notifications"
import type { UserMessageDetail, UserMessagePreview, UserMessageTask, UserMessageTemplate } from "@/api/user-notifications"
const access = ref<StaffAccess | null>(null), busy = ref(false), loaded = ref(false)
const templates = ref<readonly UserMessageTemplate[]>([]), tasks = ref<readonly UserMessageTask[]>([])
const templateId = ref(""), payload = ref<Record<string, string>>({}), selectedIds = ref<string[]>([])
const preview = ref<UserMessagePreview | null>(null), detail = ref<UserMessageDetail | null>(null)
const error = ref(""), message = ref(""), confirmationId = ref(""), confirmed = ref(false)
let lastRequest = "", idempotencyKey = ""
const globalScope = computed(() => access.value?.scopes.some(scope => scope.kind === "all") === true)
const canRead = computed(() => globalScope.value && access.value?.permissionKeys.includes("notifications.read") === true)
const canWrite = computed(() => globalScope.value && access.value?.permissionKeys.includes("notifications.write") === true)
const canSend = computed(() => globalScope.value && access.value?.permissionKeys.includes("notifications.send") === true)
const selectedTemplate = computed(() => templates.value.find(item => item.id === templateId.value))
const fieldHint = { thing: "最多20个字符", number: "请填写数字", time: "请按模板要求填写日期或时间" }
const taskLabels = { pending: "待发送", completed: "已处理", manual_required: "需人工核对" }
const statusLabels = { pending: "待发送", api_accepted: "接口已受理", rejected: "接口拒绝", unknown: "结果未知", blocked: "已阻止发送" }
onMounted(load)
async function run(action: () => Promise<void>): Promise<void> {
  if (busy.value) return
  busy.value = true; error.value = ""; message.value = ""
  try { await action() } catch (cause) { error.value = cause instanceof Error ? cause.message : "用户消息操作失败，请稍后重试。" } finally { busy.value = false }
}
async function load(): Promise<void> { await run(async () => {
  clearConfirmation(); access.value = await getCurrentStaff()
  if (!canRead.value) return
  const result = await Promise.all([getUserMessageTemplates(), getUserMessageTasks()])
  templates.value = result[0].filter(item => item.enabled); tasks.value = result[1]; loaded.value = true; resetDraft()
}) }
function resetDraft(): void { payload.value = {}; preview.value = null; selectedIds.value = []; clearConfirmation() }
function clearConfirmation(): void { confirmationId.value = ""; confirmed.value = false }
function toggleAll(): void { selectedIds.value = selectedIds.value.length === preview.value?.subscribers.length ? [] : preview.value?.subscribers.map(item => item.id) ?? [] }
async function previewSubscribers(): Promise<void> { await run(async () => { preview.value = null; selectedIds.value = []; preview.value = await previewUserMessages(templateId.value) }) }
async function createTask(): Promise<void> { await run(async () => {
  const input = { templateId: templateId.value, subscriberIds: [...selectedIds.value].sort(), payload: { ...payload.value }, page: "pages/activities/index" }
  const fingerprint = JSON.stringify(input)
  if (fingerprint !== lastRequest) { idempotencyKey = crypto.randomUUID(); lastRequest = fingerprint }
  clearConfirmation(); detail.value = await createUserMessageTask({ ...input, idempotencyKey }); message.value = "用户消息任务已创建，尚未发送。"; tasks.value = await getUserMessageTasks()
}) }
async function loadTask(id: string): Promise<void> { clearConfirmation(); detail.value = null; await run(async () => { detail.value = await getUserMessageTask(id) }) }
async function prepareSend(): Promise<void> { const id = detail.value?.task.id; if (!id) return; clearConfirmation(); await run(async () => { detail.value = await getUserMessageTask(id); if (detail.value.task.status === "pending") confirmationId.value = id }) }
async function sendTask(): Promise<void> {
  const id = confirmationId.value
  if (!confirmed.value || !id || detail.value?.task.id !== id) return
  clearConfirmation(); await run(async () => { detail.value = await sendUserMessageTask(id); message.value = "发送尝试已完成，请核对各订阅的处理状态。"; tasks.value = await getUserMessageTasks() })
}
function fieldLabel(id: string, key: string): string { return templates.value.find(item => item.id === id)?.fields.find(field => field.key === key)?.label ?? key }
</script>
<style scoped>
.user-messages { margin-bottom: var(--space-6); overflow-wrap: anywhere; }
.user-messages .notifications-check { white-space: normal; }
.user-subscribers { max-height: var(--layout-sidebar-width); overflow: auto; }
.user-messages small { color: var(--text-secondary); }
</style>
