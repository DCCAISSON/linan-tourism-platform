<template>
  <section class="notifications-page" aria-labelledby="notifications-title">
    <UserNotificationsPanel />
    <header class="notifications-heading">
      <div>
        <p class="notifications-kicker">团期通知</p>
        <h2 id="notifications-title">通知内容、接收人和发送记录</h2>
      </div>
      <p>只向家庭明确授权的接收人发送。微信接口受理不代表已送达或已读。</p>
    </header>

    <form class="notifications-toolbar" @submit.prevent="loadSession">
      <label>团期<select v-model="sessionId" :disabled="busy" required><option value="">请选择团期</option><option v-for="option in sessionOptions" :key="option.id" :value="option.id">{{ option.label }}</option></select></label>
      <button type="submit" :disabled="busy || sessionId === ''">{{ busy ? "读取中..." : "读取团期通知" }}</button>
      <button type="button" :disabled="busy" @click="loadOptions">刷新团期</button>
      <p v-if="!busy && sessionOptions.length === 0">暂无可读取的团期。</p>
      <p v-if="message" class="notifications-feedback">{{ message }}</p>
      <p v-if="error" class="notifications-feedback notifications-feedback--error" role="alert">{{ error }}</p>
    </form>

    <template v-if="session">
      <section class="notifications-panel" aria-labelledby="source-title">
        <div class="notifications-section-heading"><div><h3 id="source-title">业务通知待办</h3><p>报名成单与行前安排保存后生成。选择待办可预填摘要，再选择实际模板、预览授权接收人并创建任务。</p></div></div>
        <p v-if="session.sources.length === 0" class="notifications-empty">暂无业务通知待办。</p>
        <div v-else class="notifications-version-list">
          <article v-for="source in session.sources" :key="source.id" class="notifications-source-card">
            <strong>{{ source.title }} · 第 {{ source.sourceVersion }} 版</strong>
            <p>{{ source.bodyText }}</p><small>{{ source.createdAt }} · <span>{{ sourceStatusLabel(source.status) }}</span></small>
            <p v-if="source.orderId">来源订单：{{ source.orderId }}</p>
            <button v-if="source.linkedTaskId" type="button" :disabled="busy" @click="loadTask(source.linkedTaskId)">查看关联任务</button>
            <button v-else-if="session.canWrite" type="button" :disabled="busy || source.status === 'expired'" @click="selectSource(source)">{{ selectedSourceId === source.id ? '已选择此待办' : '填写通知并处理' }}</button>
          </article>
        </div>
      </section>
      <p v-if="!session.wechatConfigured" class="notifications-notice">微信订阅通知尚未配置完成。可保存内容和预览接收人；发送前请完成微信接入配置。</p>
      <section class="notifications-panel" aria-labelledby="content-title">
        <div class="notifications-section-heading">
          <div><h3 id="content-title">内容版本</h3><p>每次保存都会创建新版本，旧任务继续引用原版本。</p></div>
          <span class="notifications-count">{{ session.contents.length }} 个版本</span>
        </div>
        <form v-if="session.canWrite" class="notifications-form-grid" @submit.prevent="saveContent">
          <label>标题<input v-model.trim="contentDraft.title" maxlength="120" required /></label>
          <label>微信模板 ID<input v-model.trim="contentDraft.templateId" placeholder="未配置时留空" /></label>
          <label>小程序页面<input v-model.trim="contentDraft.miniappPage" placeholder="例如 pages/orders/detail" /></label>
          <label class="notifications-field-wide">正文<textarea v-model.trim="contentDraft.bodyText" rows="3" maxlength="1000" required /></label>
          <div class="notifications-field-wide">
            <p>模板字段名须与微信公众平台中该模板的字段一致。未取得真实模板时可先保存正文。</p>
            <div v-for="(field, index) in templateFields" :key="index" class="notifications-template-row">
              <label>微信模板字段名<input v-model.trim="field.key" required maxlength="64" /></label>
              <label>字段值<input v-model.trim="field.value" required maxlength="128" /></label>
              <button type="button" @click="templateFields.splice(index, 1)">移除字段</button>
            </div>
            <button type="button" @click="templateFields.push({ key: '', value: '' })">添加模板字段</button>
          </div>
          <button type="submit" :disabled="busy">创建内容版本</button>
        </form>
        <div v-if="session.contents.length" class="notifications-version-list">
          <article v-for="content in session.contents" :key="content.id">
            <strong>{{ content.title }}</strong>
            <p>{{ content.bodyText }}</p>
            <small>{{ content.createdAt }} · 模板 {{ content.templateId ?? "未配置" }}</small>
            <p v-for="(field, key) in content.templateData" :key="key">{{ key }}：{{ field.value }}</p>
            <p v-if="content.templateId && Object.keys(content.templateData).length === 0">尚未填写模板字段。</p>
            <button v-if="session.canWrite" type="button" @click="reuseContent(content)">沿用此版本填写新内容</button>
          </article>
        </div>
        <p v-else class="notifications-empty">尚无内容版本。创建内容后才能建立发送任务。</p>
      </section>

      <section v-if="session.canWrite" class="notifications-panel" aria-labelledby="entries-title">
        <div class="notifications-section-heading">
          <div><h3 id="entries-title">受控 HTTPS 入口</h3><p>企业微信、公众号和客服入口逐项配置。未配置或停用时，家庭端显示空态。</p></div>
        </div>
        <div class="notifications-entry-list">
          <form v-for="entry in entryForms" :key="entry.kind" class="notifications-entry" @submit.prevent="saveEntry(entry.kind)">
            <strong>{{ entryLabel(entry.kind) }}</strong>
            <label>显示名称<input v-model.trim="entry.label" :required="entry.enabled" /></label>
            <label>HTTPS 地址<input v-model.trim="entry.url" type="url" :required="entry.enabled" placeholder="https://..." /></label>
            <label v-if="entry.kind === 'enterprise_wechat'">企业 ID<input v-model.trim="entry.corpId" :required="entry.enabled" placeholder="企业微信 corpId" /></label>
            <p v-if="entry.kind === 'enterprise_wechat'" class="muted">使用该企业已关联小程序的微信客服链接（work.weixin.qq.com/kfid/…）。</p>
            <p v-if="entry.kind === 'official_account'" class="muted">填写公众号文章链接（mp.weixin.qq.com/s/…），并在微信后台完成关联及业务域名配置。</p>
            <label class="notifications-check"><input v-model="entry.enabled" type="checkbox" /> 启用</label>
            <button type="submit" :disabled="busy">保存入口</button>
            <span v-if="!entry.enabled" class="notifications-empty">未配置或已停用</span>
          </form>
        </div>
      </section>

      <section class="notifications-panel" aria-labelledby="task-builder-title">
        <div class="notifications-section-heading">
          <div><h3 id="task-builder-title">接收人预览与建任务</h3><p>请选择家庭已授权的接收人，核对后再创建任务。</p></div>
        </div>
        <form class="notifications-form-grid" @submit.prevent="previewTargets">
          <p v-if="selectedSource" class="notifications-notice">当前来源：{{ selectedSource.title }}（第 {{ selectedSource.sourceVersion }} 版）。{{ sourceStatusLabel(selectedSource.status) }}；请选择实际内容版本，模板未配置时保留待处理。</p>
          <button v-if="selectedSource" type="button" :disabled="busy" @click="clearSource">取消来源选择</button>
          <div class="notifications-field-wide"><label v-for="recipient in availableRecipients" :key="recipient.authorizationId" class="notifications-check"><input v-model="authorizationIds" :value="recipient.authorizationId" :disabled="busy" type="checkbox" />{{ recipient.receiverName }} · {{ relationLabel(recipient.relation) }} · {{ channelLabel(recipient.channel) }}</label><p v-if="availableRecipients.length === 0" class="notifications-empty">此处显示历史订单授权；新活动及后续提醒请使用上方用户消息订阅。</p></div>
          <button type="submit" :disabled="busy || authorizationIds.length === 0">预览接收人</button>
        </form>
        <p v-if="preview.length === 0" class="notifications-empty">暂无已预览的授权接收人。未授权记录不会进入任务。</p>
        <div v-else class="notifications-table-wrap">
          <table>
            <thead><tr><th>接收人</th><th>关系</th><th>渠道</th></tr></thead>
            <tbody><tr v-for="target in preview" :key="target.authorizationId"><td>{{ target.receiverName }}</td><td>{{ relationLabel(target.relation) }}</td><td>{{ channelLabel(target.channel) }}</td></tr></tbody>
          </table>
        </div>
        <form v-if="session.canWrite" class="notifications-form-grid notifications-task-form" @submit.prevent="createTask">
          <label>内容版本<select v-model="selectedContentId" required><option value="">请选择</option><option v-for="content in session.contents" :key="content.id" :value="content.id">{{ content.title }} · {{ content.createdAt }}</option></select></label>
          <button type="submit" :disabled="busy || !previewCurrent">创建任务</button>
          <p v-if="!previewCurrent" class="notifications-empty notifications-field-wide">接收人变更后需重新预览。</p>
        </form>
      </section>

      <section class="notifications-panel" aria-labelledby="task-list-title">
        <div class="notifications-section-heading"><div><h3 id="task-list-title">任务与尝试记录</h3><p>重试必须由工作人员明确触发，仅处理可重试失败目标。</p></div><span class="notifications-count">{{ session.tasks.length }} 个任务</span></div>
        <p v-if="session.tasks.length === 0" class="notifications-empty">暂无通知任务。</p>
        <div v-else class="notifications-task-list">
          <button v-for="task in session.tasks" :key="task.id" type="button" :class="{ 'is-active': detail?.id === task.id }" @click="loadTask(task.id)">
            <span>{{ task.createdAt }}</span><strong>{{ taskStatusLabel(task.status) }}</strong><small>{{ task.id }}</small>
          </button>
        </div>

        <div v-if="detail" class="notifications-detail">
          <div class="notifications-detail-actions">
            <div><h4>任务 {{ detail.id }}</h4><p>{{ taskStatusLabel(detail.status) }}</p></div>
            <button v-if="session.canSend" type="button" :disabled="busy || detail.status !== 'pending'" @click="sendTask">发送待处理目标</button>
            <button v-if="session.canSend" type="button" :disabled="busy || !hasRetryableTargets" @click="retryTask">明确重试失败目标</button>
          </div>
          <p class="notifications-notice">“接口已受理”仅是 API 受理证据，送达状态和阅读状态仍为未知。</p>
          <div class="notifications-table-wrap">
            <table>
              <thead><tr><th>接收人</th><th>渠道</th><th>目标状态</th><th>订单</th></tr></thead>
              <tbody><tr v-for="target in detail.targets" :key="target.id"><td>{{ target.receiverName }}</td><td>{{ channelLabel(target.channel) }}</td><td>{{ deliveryStatusLabel(target.status) }}</td><td>{{ target.orderId }}</td></tr></tbody>
            </table>
          </div>
          <p v-if="detail.attempts.length === 0" class="notifications-empty">尚无发送尝试。</p>
          <div v-else class="notifications-table-wrap">
            <table>
              <thead><tr><th>目标</th><th>次数</th><th>状态</th><th>服务商信息</th><th>送达证据</th><th>阅读</th></tr></thead>
              <tbody><tr v-for="attempt in detail.attempts" :key="attempt.id"><td>{{ attemptTargetLabel(attempt.targetId) }}</td><td>{{ attempt.attemptNumber }}</td><td>{{ deliveryStatusLabel(attempt.status) }}</td><td>{{ attempt.errorCode ?? "无错误码" }}<br />{{ attempt.providerMessage }}</td><td>{{ attempt.deliveryEvidence === "api_accepted_only" ? "仅接口受理" : "无" }}</td><td>未知</td></tr></tbody>
            </table>
          </div>
        </div>
      </section>
    </template>

    <p v-else class="notifications-welcome">请选择团期读取配置。</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue"
import UserNotificationsPanel from "@/components/UserNotificationsPanel.vue"
import {
  createNotificationContent,
  createNotificationTask,
  getNotificationSession,
  getNotificationTask,
  getNotificationSessions,
  getNotificationRecipients,
  previewNotificationTargets,
  readableNotificationError,
  retryNotificationTask,
  saveNotificationEntry,
  sendNotificationTask,
} from "@/api/notifications"
import type { NotificationContentVersion, NotificationSessionOption, NotificationChannelEntry, NotificationDeliveryStatus, NotificationEntryKind, NotificationRelation, NotificationSession, NotificationTargetPreview, NotificationTask, NotificationTaskStatus } from "@/api/notifications"
import { canRetryNotificationTargets, createNotificationPreviewSelection, isNotificationPreviewCurrent, notificationAttemptTargetLabel } from "@/api/notifications.policy"
import type { NotificationPreviewSelection } from "@/api/notifications.policy"
import type { NotificationBusinessSource } from "@/api/notifications"
import "@/styles/notifications.css"

type EntryForm = { readonly kind: NotificationEntryKind; label: string; url: string; corpId: string; enabled: boolean; version: number }

const sessionId = ref("")
const loadedSessionId = ref("")
const session = ref<NotificationSession | null>(null)
const detail = ref<NotificationTask | null>(null)
const preview = ref<readonly NotificationTargetPreview[]>([])
const authorizationIds = ref<string[]>([])
const recipients = ref<readonly NotificationTargetPreview[]>([])
const sessionOptions = ref<readonly NotificationSessionOption[]>([])
const templateFields = ref<{ key: string; value: string }[]>([])
const previewSelection = ref<NotificationPreviewSelection | null>(null)
const selectedContentId = ref("")
const selectedSourceId = ref("")
const selectedSource = computed(() => session.value?.sources.find(source => source.id === selectedSourceId.value))
const availableRecipients = computed(() => selectedSource.value === undefined ? recipients.value : recipients.value.filter(row => selectedSource.value?.authorizationIds.includes(row.authorizationId)))
const idempotencyKey = ref(newIdempotencyKey())
const busy = ref(false)
const message = ref("")
const error = ref("")
const contentDraft = reactive({ title: "", bodyText: "", templateId: "", miniappPage: "" })
const entryForms = reactive<EntryForm[]>([
  { kind: "enterprise_wechat", label: "", url: "", corpId: "", enabled: false, version: 0 },
  { kind: "official_account", label: "", url: "", corpId: "", enabled: false, version: 0 },
  { kind: "customer_service", label: "", url: "", corpId: "", enabled: false, version: 0 },
])
const previewCurrent = computed(() => preview.value.length > 0 && isNotificationPreviewCurrent(previewSelection.value, loadedSessionId.value, authorizationIds.value))
const hasRetryableTargets = computed(() => canRetryNotificationTargets(detail.value?.targets ?? []))
watch(sessionId, invalidateLoadedSession)
watch([selectedContentId, authorizationIds, selectedSourceId], () => { idempotencyKey.value = newIdempotencyKey() }, { deep: true })
onMounted(loadOptions)

async function loadOptions(): Promise<void> { await run(async () => { sessionOptions.value = await getNotificationSessions() }) }
async function loadSession(): Promise<void> { const requestedSessionId = sessionId.value; clearLoadedState(); await run(async () => { const [loaded, options] = await Promise.all([getNotificationSession(requestedSessionId), getNotificationRecipients(requestedSessionId)]); if (sessionId.value !== requestedSessionId) throw new Error("团期已变化，请重新读取。"); loadedSessionId.value = requestedSessionId; session.value = loaded; recipients.value = options; applyEntries(loaded.entries); message.value = "团期通知已读取。" }) }
async function saveContent(): Promise<void> { const activeSessionId = loadedSessionId.value; if (activeSessionId === "") return; await run(async () => { await createNotificationContent(activeSessionId, { title: contentDraft.title, bodyText: contentDraft.bodyText, templateId: emptyToNull(contentDraft.templateId), miniappPage: emptyToNull(contentDraft.miniappPage), templateData: readTemplateFields() }); contentDraft.title = ""; contentDraft.bodyText = ""; session.value = await getNotificationSession(activeSessionId); message.value = "内容版本已创建。" }) }
async function saveEntry(kind: NotificationEntryKind): Promise<void> { const activeSessionId = loadedSessionId.value; const form = entryForms.find(item => item.kind === kind); if (form === undefined || activeSessionId === "") return; await run(async () => { if (form.enabled && !form.url.startsWith("https://")) throw new Error("启用入口必须使用 HTTPS 地址。"); const saved = await saveNotificationEntry(activeSessionId, kind, { label: form.label, url: form.url, corpId: form.corpId || null, enabled: form.enabled, expectedVersion: form.version }); Object.assign(form, saved, { corpId: saved.corpId ?? "" }); message.value = form.enabled ? "入口已保存并启用。" : "入口已保存为停用。" }) }
async function previewTargets(): Promise<void> { const selection = createNotificationPreviewSelection(loadedSessionId.value, authorizationIds.value); if (selection.sessionId === "" || selection.authorizationIds.length === 0) return; await run(async () => { const loadedPreview = await previewNotificationTargets(selection.sessionId, selection.authorizationIds, selectedSourceId.value || undefined); preview.value = loadedPreview; previewSelection.value = selection; message.value = loadedPreview.length === 0 ? "没有可用授权接收人。" : `已预览 ${loadedPreview.length} 名授权接收人。` }) }
async function createTask(): Promise<void> { const selection = previewSelection.value; if (!previewCurrent.value || selection === null) return; await run(async () => { detail.value = await createNotificationTask(selection.sessionId, { ...(selectedSourceId.value === "" ? {} : { sourceId: selectedSourceId.value }), contentVersionId: selectedContentId.value, authorizationIds: selection.authorizationIds, idempotencyKey: idempotencyKey.value }); session.value = await getNotificationSession(selection.sessionId); idempotencyKey.value = newIdempotencyKey(); message.value = "通知任务已创建，尚未发送。" }) }
async function loadTask(taskId: string): Promise<void> { await run(async () => { detail.value = await getNotificationTask(taskId) }) }
async function sendTask(): Promise<void> { const taskId = detail.value?.id; if (taskId === undefined) return; await run(async () => { detail.value = await sendNotificationTask(taskId); await refreshSession(); message.value = "发送尝试已完成，请核对目标和尝试状态。" }) }
async function retryTask(): Promise<void> { const taskId = detail.value?.id; if (taskId === undefined) return; await run(async () => { detail.value = await retryNotificationTask(taskId); await refreshSession(); message.value = "已明确重试可重试失败目标。" }) }
async function refreshSession(): Promise<void> { if (loadedSessionId.value !== "") session.value = await getNotificationSession(loadedSessionId.value) }
async function run(action: () => Promise<void>): Promise<void> { busy.value = true; error.value = ""; message.value = ""; try { await action() } catch (cause) { error.value = cause instanceof Error ? cause.message : readableNotificationError(cause) } finally { busy.value = false } }

function invalidateLoadedSession(): void { if (loadedSessionId.value !== "" && sessionId.value !== loadedSessionId.value) clearLoadedState() }
function clearLoadedState(): void { loadedSessionId.value = ""; session.value = null; detail.value = null; preview.value = []; recipients.value = []; authorizationIds.value = []; previewSelection.value = null; selectedContentId.value = ""; selectedSourceId.value = ""; Object.assign(contentDraft, { title: "", bodyText: "", templateId: "", miniappPage: "" }); templateFields.value = []; idempotencyKey.value = newIdempotencyKey() }
function applyEntries(entries: readonly NotificationChannelEntry[]): void { for (const form of entryForms) { const entry = entries.find(entry => entry.kind === form.kind); Object.assign(form, entry ?? { label: "", url: "", enabled: false, version: 0 }, { corpId: entry?.corpId ?? "" }) } }
function readTemplateFields(): Readonly<Record<string, { readonly value: string }>> {
  const output: Record<string, { readonly value: string }> = {}
  for (const field of templateFields.value) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(field.key) || Object.hasOwn(output, field.key)) throw new Error("模板字段名不正确或重复，请核对微信后台配置。")
    if (field.value.trim() === "") throw new Error("请填写模板字段值。")
    output[field.key] = { value: field.value }
  }
  return output
}
function reuseContent(content: NotificationContentVersion): void { Object.assign(contentDraft, { title: content.title, bodyText: content.bodyText, templateId: content.templateId ?? "", miniappPage: content.miniappPage ?? "" }); templateFields.value = Object.entries(content.templateData).map(([key, field]) => ({ key, value: field.value })) }
function selectSource(source: NotificationBusinessSource): void {
  selectedSourceId.value = source.id
  selectedContentId.value = ""
  authorizationIds.value = []
  preview.value = []
  previewSelection.value = null
  Object.assign(contentDraft, { title: source.title, bodyText: source.bodyText, templateId: "", miniappPage: "pages/orders/detail" })
  templateFields.value = []
  message.value = "业务摘要已填写。请核对并选择真实模板；保存内容后预览接收人。"
}
function clearSource(): void { selectedSourceId.value = ""; authorizationIds.value = []; preview.value = []; previewSelection.value = null }
function sourceStatusLabel(status: NotificationBusinessSource["status"]): string { return { expired: "已过期，禁止发送", linked: "已关联任务", awaiting_authorization: "等待有效付款及接收人授权", pending: "待选择模板并创建任务" }[status] }
function newIdempotencyKey(): string { return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `notification-${Date.now()}` }
function emptyToNull(value: string): string | null { return value === "" ? null : value }
function attemptTargetLabel(targetId: string): string { return notificationAttemptTargetLabel(targetId, detail.value?.targets ?? []) }
function entryLabel(kind: NotificationEntryKind): string { return { enterprise_wechat: "企业微信", official_account: "微信公众号", customer_service: "客服入口" }[kind] }
function relationLabel(relation: NotificationRelation): string { return { guardian: "监护人", traveler: "出行人", emergency_contact: "紧急联系人", other: "其他" }[relation] }
function channelLabel(channel: "wechat_subscribe" | "manual"): string { return channel === "wechat_subscribe" ? "微信订阅消息" : "人工处理" }
function taskStatusLabel(status: NotificationTaskStatus): string { return { pending: "待发送", completed: "已处理", retryable_failed: "存在可重试失败", manual_required: "需要人工处理" }[status] }
function deliveryStatusLabel(status: NotificationDeliveryStatus): string { return { pending: "待发送", api_accepted: "接口已受理", undelivered: "未送达", retryable_failed: "可重试失败", manual_required: "需要人工处理" }[status] }
</script>
