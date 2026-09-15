<template>
  <ConfigurationCard
    empty-text="暂无课程，请先新增课程。"
    :count="catalogItems.length"
    :error="error"
    :loading="loading"
    title="课程"
    title-id="catalog-title"
    wide
  >
    <template #form>
      <form class="configuration-form configuration-form--grid" @submit.prevent="submit">
        <fieldset :disabled="submitting || schools.length === 0">
          <div class="field">
            <label for="catalog-school">课程学校</label>
            <select id="catalog-school" v-model="organizationId">
              <option value="">请选择学校</option>
              <option v-for="school in schools" :key="school.id" :value="school.id">
                {{ school.name }}
              </option>
            </select>
          </div>
          <div class="field">
            <label for="catalog-code">课程编码</label>
            <input id="catalog-code" v-model.trim="code" autocomplete="off" />
          </div>
          <div class="field">
            <label for="catalog-title-field">课程名称</label>
            <input id="catalog-title-field" v-model.trim="title" autocomplete="off" />
          </div>
          <div class="field">
            <label for="catalog-status">课程状态</label>
            <select id="catalog-status" v-model="status">
              <option value="active">启用</option>
              <option value="draft">草稿</option>
            </select>
          </div>
          <p v-if="visibleError" class="form-error">{{ visibleError }}</p>
          <button type="submit" :disabled="submitting || schools.length === 0">
            {{ submitting ? "提交中..." : "新增课程" }}
          </button>
        </fieldset>
      </form>
    </template>
    <ul class="record-list record-list--columns">
      <li v-for="item in catalogItems" :key="item.id">
        <strong>{{ item.title }}</strong>
        <span>编码：{{ item.code }}</span>
        <span>{{ schoolNameById(item.organizationId) }}</span>
        <span>{{ statusText(item.status) }}</span>
        <button type="button" class="record-action" :disabled="submitting" @click="emit('delete', item.id)">
          删除
        </button>
      </li>
    </ul>
  </ConfigurationCard>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"

import type { CatalogItem, CatalogItemPayload, School } from "@/api/configuration"
import ConfigurationCard from "./ConfigurationCard.vue"
import { statusText } from "./format"

const props = defineProps<{
  readonly catalogItems: readonly CatalogItem[]
  readonly error: string
  readonly formError: string
  readonly loading: boolean
  readonly schools: readonly School[]
  readonly submitting: boolean
}>()

const emit = defineEmits<{
  create: [payload: CatalogItemPayload]
  delete: [id: string]
}>()

const code = ref("")
const localError = ref("")
const organizationId = ref("")
const status = ref("active")
const title = ref("")

const visibleError = computed(() => localError.value || props.formError)

watch(
  () => props.schools,
  schools => {
    if (organizationId.value === "") {
      organizationId.value = schools.at(0)?.id ?? ""
    }
  },
  { immediate: true },
)

function submit(): void {
  localError.value = ""

  if (organizationId.value === "" || code.value === "" || title.value === "") {
    localError.value = "请选择学校，并填写课程编码和名称"
    return
  }

  emit("create", {
    organizationId: organizationId.value,
    code: code.value,
    title: title.value,
    status: status.value,
  })
}

function schoolNameById(schoolId: string): string {
  return props.schools.find(school => school.id === schoolId)?.name ?? "未关联学校"
}
</script>
