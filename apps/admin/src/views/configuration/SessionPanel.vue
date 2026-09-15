<template>
  <ConfigurationCard
    empty-text="暂无团期，请先新增团期。"
    :count="tourSessions.length"
    :error="error"
    :loading="loading"
    title="团期"
    title-id="session-title"
    wide
  >
    <template #form>
      <SessionCreateForm
        :catalog-items="catalogItems"
        :form-error="formError"
        :schools="schools"
        :submitting="submitting"
        @create="emit('create', $event)"
      />
      <SessionEditForm
        :form-error="formError"
        :submitting="submitting"
        :tour-sessions="tourSessions"
        @update="emit('update', $event)"
      />
    </template>
    <ul class="record-list record-list--columns">
      <li v-for="session in tourSessions" :key="session.id">
        <strong>{{ catalogTitleById(session.catalogItemId) }}</strong>
        <span>{{ formatFen(session.priceFen) }}</span>
        <span>{{ session.capacity }} 人</span>
        <span>{{ formatRange(session.startsAt, session.endsAt) }}</span>
        <span>{{ formatRange(session.enrollmentOpensAt, session.enrollmentClosesAt) }}</span>
        <span>{{ statusText(session.status) }}</span>
        <span class="record-actions">
          <button type="button" class="record-action" :disabled="submitting" @click="publish(session.id)">
            发布
          </button>
          <button type="button" class="record-action" :disabled="submitting" @click="close(session.id)">
            关闭
          </button>
          <button type="button" class="record-action" :disabled="submitting" @click="emit('delete', session.id)">
            删除
          </button>
        </span>
      </li>
    </ul>
  </ConfigurationCard>
</template>

<script setup lang="ts">
import type { CatalogItem, School, TourSession, TourSessionPayload, TourSessionUpdatePayload } from "@/api/configuration"
import ConfigurationCard from "./ConfigurationCard.vue"
import { formatFen, formatRange, statusText } from "./format"
import SessionCreateForm from "./SessionCreateForm.vue"
import SessionEditForm from "./SessionEditForm.vue"

const props = defineProps<{
  readonly catalogItems: readonly CatalogItem[]
  readonly error: string
  readonly formError: string
  readonly loading: boolean
  readonly schools: readonly School[]
  readonly submitting: boolean
  readonly tourSessions: readonly TourSession[]
}>()

const emit = defineEmits<{
  create: [payload: TourSessionPayload]
  delete: [id: string]
  update: [change: { readonly id: string; readonly payload: TourSessionUpdatePayload }]
}>()

function publish(id: string): void {
  emit("update", { id, payload: { status: "published" } })
}

function close(id: string): void {
  emit("update", { id, payload: { status: "closed" } })
}

function catalogTitleById(itemId: string): string {
  return props.catalogItems.find(item => item.id === itemId)?.title ?? "未关联课程"
}
</script>
