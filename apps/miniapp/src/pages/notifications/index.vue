<script setup lang="ts">
import { computed, reactive, ref } from "vue"
import { onLoad } from "@dcloudio/uni-app"
import { createNotificationApi } from "../../notification-api"
import type { FamilyNotificationAuthorization, FamilyNotificationOverview, NotificationChannel, NotificationRelation } from "../../notification-types"
import { ApiError } from "../../api-error"

const api = createNotificationApi()
const orderId = ref("")
const overview = ref<FamilyNotificationOverview | null>(null)
const state = ref<"loading" | "ready" | "error">("loading")
const saving = ref(false)
const error = ref("")
const message = ref("")
const form = reactive<{ receiverName: string; relation: NotificationRelation; channel: NotificationChannel }>({ receiverName: "", relation: "guardian", channel: "wechat_subscribe" })
const activeAuthorizations = computed(() => overview.value?.authorizations.filter(item => item.active) ?? [])
const historyAuthorizations = computed(() => overview.value?.authorizations.filter(item => !item.active) ?? [])
const entries = computed(() => overview.value?.entries.filter(item => item.enabled && item.url.startsWith("https://")) ?? [])

onLoad((query) => { orderId.value = query?.["orderId"] ?? ""; void load() })

async function load(): Promise<void> {
  state.value = "loading"
  error.value = ""
  try {
    if (orderId.value === "") throw new Error("缺少订单信息，无法读取通知授权。")
    overview.value = await api.getOverview(orderId.value)
    state.value = "ready"
  } catch (cause) {
    state.value = "error"
    error.value = readableError(cause, "通知授权加载失败，请重试。")
  }
}

async function authorize(): Promise<void> {
  if (form.receiverName === "") return
  saving.value = true
  error.value = ""
  message.value = ""
  try {
    await api.authorize(orderId.value, { receiverName: form.receiverName, relation: form.relation, channel: form.channel, idempotencyKey: newIdempotencyKey() })
    form.receiverName = ""
    message.value = "接收人授权已保存。"
    await load()
  } catch (cause) {
    error.value = readableError(cause, "授权保存失败，请重试。")
  } finally {
    saving.value = false
  }
}

async function withdraw(item: FamilyNotificationAuthorization): Promise<void> {
  saving.value = true
  error.value = ""
  message.value = ""
  try {
    await api.withdraw(orderId.value, item.id, item.version)
    message.value = "授权已撤回，后续通知任务不会再向该记录发送。"
    await load()
  } catch (cause) {
    error.value = readableError(cause, "撤回失败，请刷新后重试。")
  } finally {
    saving.value = false
  }
}

function copyEntry(url: string): void {
  uni.setClipboardData({ data: url, success: () => uni.showToast({ title: "入口已复制", icon: "success" }) })
}

function readableError(cause: unknown, fallback: string): string {
  if (cause instanceof ApiError || cause instanceof Error) return cause.message
  return fallback
}
function selectRelation(event: { readonly detail: { readonly value: number | string } }): void {
  const index = typeof event.detail.value === "number" ? event.detail.value : Number.parseInt(event.detail.value, 10)
  form.relation = index === 1 ? "traveler" : index === 2 ? "emergency_contact" : index === 3 ? "other" : "guardian"
}
function selectChannel(event: { readonly detail: { readonly value: number | string } }): void {
  const index = typeof event.detail.value === "number" ? event.detail.value : Number.parseInt(event.detail.value, 10)
  form.channel = index === 1 ? "manual" : "wechat_subscribe"
}
function newIdempotencyKey(): string { return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `recipient-${Date.now()}` }
function relationLabel(relation: NotificationRelation): string { return { guardian: "监护人", traveler: "出行人", emergency_contact: "紧急联系人", other: "其他" }[relation] }
function channelLabel(channel: NotificationChannel): string { return channel === "wechat_subscribe" ? "微信订阅消息" : "人工联系" }
function entryLabel(kind: "enterprise_wechat" | "official_account" | "customer_service"): string { return { enterprise_wechat: "企业微信", official_account: "微信公众号", customer_service: "客服" }[kind] }
</script>

<template>
  <view class="notification-page">
    <view class="notification-hero">
      <text class="notification-kicker">家庭通知</text>
      <text class="notification-title">接收人授权与服务入口</text>
      <text class="notification-intro">本页只显示当前家庭、当前订单的授权。付款人不会自动成为通知接收人。</text>
    </view>

    <view v-if="state === 'loading'" class="notification-state" aria-live="polite">
      <view class="notification-skeleton notification-skeleton--title" />
      <view class="notification-skeleton" />
      <view class="notification-skeleton" />
    </view>
    <view v-else-if="state === 'error'" class="notification-state notification-state--error">
      <text>{{ error }}</text>
      <button class="notification-button notification-button--secondary" @tap="load">重新加载</button>
    </view>

    <template v-else-if="overview">
      <text v-if="message" class="notification-feedback">{{ message }}</text>
      <text v-if="error" class="notification-feedback notification-feedback--error">{{ error }}</text>

      <view class="notification-card">
        <text class="notification-card-title">已授权接收人</text>
        <text class="notification-card-copy">授权记录属于当前家庭。撤回后，后续任务不得继续发送。</text>
        <view v-if="activeAuthorizations.length === 0" class="notification-empty">
          <text>当前订单尚无有效接收人授权。</text>
          <text>请填写真实接收人姓名和关系，不要使用付款人信息代填。</text>
        </view>
        <view v-for="item in activeAuthorizations" :key="item.id" class="notification-recipient">
          <view>
            <text class="notification-recipient-name">{{ item.receiverName }}</text>
            <text class="notification-meta">{{ relationLabel(item.relation) }} · {{ channelLabel(item.channel) }}</text>
          </view>
          <button class="notification-button notification-button--danger" :disabled="saving" @tap="withdraw(item)">撤回</button>
        </view>
      </view>

      <form class="notification-card" @submit.prevent="authorize">
        <text class="notification-card-title">新增接收人授权</text>
        <label class="notification-field"><text>接收人姓名</text><input v-model.trim="form.receiverName" maxlength="80" required placeholder="请填写实际接收人" /></label>
        <label class="notification-field"><text>与出行人的关系</text><picker :range="['监护人', '出行人', '紧急联系人', '其他']" @change="selectRelation"><view class="notification-picker">{{ relationLabel(form.relation) }}</view></picker></label>
        <label class="notification-field"><text>允许渠道</text><picker :range="['微信订阅消息', '人工联系']" @change="selectChannel"><view class="notification-picker">{{ channelLabel(form.channel) }}</view></picker></label>
        <text class="notification-help">微信订阅消息使用当前登录家庭身份授权，不读取订单付款人。</text>
        <button class="notification-button" form-type="submit" :disabled="saving || form.receiverName === ''">{{ saving ? "保存中..." : "确认授权" }}</button>
      </form>

      <view class="notification-card">
        <text class="notification-card-title">服务入口</text>
        <text class="notification-card-copy">只展示运营已启用的 HTTPS 地址。未配置的渠道不会显示为已接通。</text>
        <view v-if="entries.length === 0" class="notification-empty"><text>当前团期尚未配置企业微信、公众号或客服入口。</text></view>
        <view v-for="entry in entries" :key="entry.kind" class="notification-entry">
          <view><text class="notification-recipient-name">{{ entry.label }}</text><text class="notification-meta">{{ entryLabel(entry.kind) }}</text></view>
          <button class="notification-button notification-button--secondary" @tap="copyEntry(entry.url)">复制入口</button>
        </view>
      </view>

      <view v-if="historyAuthorizations.length" class="notification-card notification-card--quiet">
        <text class="notification-card-title">已撤回记录</text>
        <view v-for="item in historyAuthorizations" :key="item.id" class="notification-history"><text>{{ item.receiverName }} · {{ relationLabel(item.relation) }}</text><text class="notification-meta">已撤回，不再发送</text></view>
      </view>
    </template>
  </view>
</template>

<style scoped>
.notification-page { min-height: 100vh; box-sizing: border-box; padding: var(--space-4); padding-bottom: calc(var(--space-10) + env(safe-area-inset-bottom)); background: var(--surface-primary); color: var(--text-primary); }
.notification-hero { display: grid; gap: var(--space-2); padding: var(--space-5); border-radius: var(--radius-banner); background: var(--brand-mist); }
.notification-kicker { color: var(--accent-secondary); font-size: var(--font-body-sm); font-weight: 600; }
.notification-title { font-size: var(--font-h1); font-weight: 700; line-height: 1.3; }
.notification-intro, .notification-card-copy, .notification-help { color: var(--text-secondary); font-size: var(--font-body-sm); line-height: 1.6; }
.notification-card, .notification-state { display: grid; gap: var(--space-4); margin-top: var(--space-4); padding: var(--space-4); border-radius: var(--radius-card); background: var(--surface-elevated); }
.notification-card--quiet { background: var(--surface-secondary); }
.notification-card-title { font-size: var(--font-h3); font-weight: 600; }
.notification-recipient, .notification-entry { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-3); align-items: center; padding-top: var(--space-3); border-top: 1px solid var(--border-subtle); }
.notification-recipient-name, .notification-history text { display: block; overflow-wrap: anywhere; font-size: var(--font-body); font-weight: 600; }
.notification-meta { display: block; margin-top: var(--space-1); color: var(--text-secondary); font-size: var(--font-caption); line-height: 1.5; }
.notification-field { display: grid; gap: var(--space-2); color: var(--text-secondary); font-size: var(--font-body-sm); }
.notification-field input, .notification-picker { min-height: var(--size-touch-target); box-sizing: border-box; padding: var(--space-3); border: 1px solid var(--border-default); border-radius: var(--radius-control); color: var(--text-primary); background: var(--surface-primary); font-size: var(--font-body); }
.notification-button { min-height: var(--size-touch-target); margin: 0; padding: 0 var(--space-4); border-radius: var(--radius-control); color: var(--on-accent); background: var(--accent-primary); font-size: var(--font-body); line-height: var(--size-touch-target); }
.notification-button::after { border: 0; }
.notification-button[disabled] { color: var(--text-tertiary); background: var(--surface-secondary); }
.notification-button--secondary { border: 1px solid var(--accent-primary); color: var(--accent-primary); background: var(--surface-elevated); }
.notification-button--danger { border: 1px solid var(--status-error); color: var(--status-error); background: var(--surface-elevated); }
.notification-empty, .notification-state { color: var(--text-secondary); font-size: var(--font-body-sm); line-height: 1.6; }
.notification-empty { display: grid; gap: var(--space-2); padding: var(--space-4); border-radius: var(--radius-control); background: var(--surface-secondary); }
.notification-state--error, .notification-feedback--error { color: var(--status-error); }
.notification-feedback { display: block; margin-top: var(--space-4); color: var(--status-success); font-size: var(--font-body-sm); }
.notification-history { display: grid; gap: var(--space-1); padding-top: var(--space-3); border-top: 1px solid var(--border-default); }
.notification-skeleton { height: 16px; border-radius: var(--radius-control); background: var(--surface-secondary); opacity: .8; }
.notification-skeleton--title { width: 56%; height: 24px; }
@media (min-width: 768px) { .notification-page { max-width: 760px; margin: 0 auto; padding: var(--space-7); } }
@media (prefers-reduced-motion: reduce) { .notification-button { transition: none; } }
</style>
