<script setup lang="ts">
import { reactive, ref } from "vue"
import { onLoad } from "@dcloudio/uni-app"
import { createServiceFeedbackClient } from "../../service-feedback-api"
import { ApiError } from "../../api-error"

const client = createServiceFeedbackClient()
const form = reactive({
  tourSessionId: "",
  orderId: "",
  rating: 5,
  content: "",
  contactName: "",
  allowPublic: false,
})
const submitting = ref(false)
const message = ref("")
const error = ref("")

onLoad((query) => {
  const params = query ?? {}
  form.tourSessionId = typeof params["tourSessionId"] === "string" ? params["tourSessionId"] : ""
  form.orderId = typeof params["orderId"] === "string" ? params["orderId"] : ""
})

async function submit(): Promise<void> {
  submitting.value = true
  message.value = ""
  error.value = ""
  try {
    await client.submit({
      tourSessionId: form.tourSessionId,
      orderId: form.orderId,
      rating: Number(form.rating),
      content: form.content.trim(),
      contactName: form.contactName.trim(),
      allowPublic: form.allowPublic,
      idempotencyKey: makeRequestId(),
    })
    message.value = "反馈已提交，默认不公开；工作人员审核并确认公开授权后才会展示摘要。"
    form.content = ""
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : "反馈提交失败，请稍后重试"
  } finally {
    submitting.value = false
  }
}

function makeRequestId(): string {
  return `feedback-${Date.now()}-${Math.random().toString(16).slice(2)}`
}
</script>

<template>
  <view class="feedback-page">
    <text class="page-heading">服务反馈</text>
    <text class="page-subtitle">这里提交的是服务意见，不影响学生评价等级。</text>
    <view class="info-card feedback-form">
      <label class="feedback-field">联系人<input v-model="form.contactName" maxlength="80" placeholder="请输入联系人" /></label>
      <label class="feedback-field">评分<input v-model="form.rating" type="number" min="1" max="5" /></label>
      <label class="feedback-field">意见<textarea v-model="form.content" maxlength="1000" placeholder="请填写行程组织、导游服务或沟通建议" /></label>
      <label class="feedback-check"><checkbox :checked="form.allowPublic" @tap="form.allowPublic = !form.allowPublic" />允许审核后公开摘要</label>
      <button class="button-primary" :disabled="submitting || !form.content.trim() || !form.contactName.trim()" @tap="submit">{{ submitting ? "提交中..." : "提交反馈" }}</button>
    </view>
    <text v-if="message" class="feedback-message">{{ message }}</text>
    <text v-if="error" class="feedback-error">{{ error }}</text>
  </view>
</template>

<style>
@import "../../styles/discovery.css";
.feedback-page { min-height: 100vh; background: var(--surface-primary); padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-4); }
.feedback-form { display: flex; flex-direction: column; gap: var(--space-4); }
.feedback-field { display: flex; flex-direction: column; gap: var(--space-2); color: var(--text-secondary); font-size: var(--font-body-sm); }
.feedback-field input, .feedback-field textarea { min-height: var(--size-touch-target); border: 1px solid var(--border-default); border-radius: var(--radius-control); padding: var(--space-3); background: var(--surface-elevated); color: var(--text-primary); }
.feedback-field textarea { min-height: 128px; }
.feedback-check { display: flex; align-items: center; gap: var(--space-2); color: var(--text-secondary); font-size: var(--font-body-sm); }
.feedback-message { color: var(--status-success); font-size: var(--font-body-sm); }
.feedback-error { color: var(--status-error); font-size: var(--font-body-sm); }
</style>
