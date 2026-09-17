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
          <div class="field configuration-content-field">
            <label for="catalog-description">课程介绍</label>
            <textarea id="catalog-description" v-model.trim="description" maxlength="4000" rows="3" placeholder="可选，填写课程内容与参加说明" />
          </div>
          <div class="field configuration-content-field">
            <label for="catalog-cover">封面链接</label>
            <input id="catalog-cover" v-model.trim="coverImageUrl" maxlength="2048" placeholder="可选，使用自有或授权图片的 HTTPS 链接" />
          </div>
          <p v-if="visibleError" class="form-error">{{ visibleError }}</p>
          <button type="submit" :disabled="submitting || schools.length === 0">
            {{ submitting ? "提交中..." : "新增课程" }}
          </button>
        </fieldset>
      </form>
      <form v-if="catalogItems.length > 0" class="configuration-form configuration-form--grid" @submit.prevent="saveContent">
        <fieldset :disabled="submitting">
          <div class="field">
            <label for="catalog-edit">编辑课程内容</label>
            <select id="catalog-edit" v-model="editingId">
              <option value="">请选择课程</option>
              <option v-for="item in catalogItems" :key="item.id" :value="item.id">{{ item.title }}</option>
            </select>
          </div>
          <div class="field configuration-content-field">
            <label for="catalog-edit-description">修改课程介绍</label>
            <textarea id="catalog-edit-description" v-model.trim="editingDescription" maxlength="4000" rows="3" :disabled="!editingId" />
          </div>
          <div class="field configuration-content-field">
            <label for="catalog-edit-cover">修改封面链接</label>
            <input id="catalog-edit-cover" v-model.trim="editingCover" maxlength="2048" :disabled="!editingId" />
          </div>
          <button type="submit" :disabled="!editingId || submitting">{{ submitting ? "保存中..." : "保存课程内容" }}</button>
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

import type { CatalogItem, CatalogItemPayload, CatalogContentPayload, School } from "@/api/configuration"
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
  update: [change: { readonly id: string; readonly payload: CatalogContentPayload }]
}>()

const code = ref("")
const localError = ref("")
const organizationId = ref("")
const status = ref("active")
const title = ref("")
const description = ref("")
const coverImageUrl = ref("")
const editingId = ref("")
const editingDescription = ref("")
const editingCover = ref("")
watch([editingId, () => props.catalogItems], () => {
  const item = props.catalogItems.find(item => item.id === editingId.value)
  if (!item) editingId.value = ""
  editingDescription.value = item?.description ?? ""
  editingCover.value = item?.coverImageUrl ?? ""
})

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
    description: description.value,
    coverImageUrl: coverImageUrl.value,
  })
}

function saveContent(): void {
  if (editingId.value !== "") emit("update", { id: editingId.value, payload: { description: editingDescription.value, coverImageUrl: editingCover.value } })
}

function schoolNameById(schoolId: string): string {
  return props.schools.find(school => school.id === schoolId)?.name ?? "未关联学校"
}
</script>
