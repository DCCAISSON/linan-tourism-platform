<template>
  <ConfigurationCard
    empty-text="暂无课程，请先新增课程。"
    :count="catalogItems.length"
    :error="error"
    :loading="loading"
    title="课程"
    title-id="catalog-title"
    wide
    @input="feedbackVisible = false"
    @change="feedbackVisible = false"
  >
    <template #form>
      <p class="state-text">保存课程不等于发布团期。课程启用后，还需设置团期、启用告知书并发布；报名时间与名额以团期为准。已发布课程的介绍和封面保存后，小程序重新进入相应页面后显示更新。</p>
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
          <CatalogCoverField id="catalog-cover" v-model="coverImageUrl" :disabled="submitting || schools.length === 0" @uploading="createUploading = $event" />
          <p v-if="localError" class="form-error">{{ localError }}</p>
          <button type="submit" :disabled="submitting || coverUploading || schools.length === 0">
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
          <div class="field">
            <label for="catalog-edit-title">修改课程名称</label>
            <input id="catalog-edit-title" v-model.trim="editingTitle" maxlength="255" :disabled="!editingId || linkedToTemplate" />
          </div>
          <div class="field">
            <label for="catalog-edit-status">修改课程状态</label>
            <select id="catalog-edit-status" v-model="editingStatus" :disabled="!editingId || linkedToTemplate" aria-describedby="catalog-edit-status-help">
              <option value="active">启用</option>
              <option value="draft">草稿</option>
              <option value="disabled">停用</option>
            </select>
            <small id="catalog-edit-status-help" class="state-text">停用后家长端不再展示该课程，已有订单保留；启用后已发布团期恢复展示。</small>
          </div>
          <div class="field configuration-content-field">
            <label for="catalog-edit-description">修改课程介绍</label>
            <textarea id="catalog-edit-description" v-model.trim="editingDescription" maxlength="4000" rows="3" :disabled="!editingId || linkedToTemplate" />
          </div>
          <CatalogCoverField :key="editingId" id="catalog-edit-cover" v-model="editingCover" label="修改封面"
            :disabled="submitting || !editingId || linkedToTemplate" @uploading="editUploading = $event" />
          <p v-if="linkedToTemplate" class="state-text configuration-content-field">该课程使用共享模板，请在上方编辑模板；如需单校修改，可先解除关联。</p>
          <p v-if="editingError" class="form-error" role="alert">{{ editingError }}</p>
          <button type="submit" :disabled="!editingId || submitting || coverUploading || linkedToTemplate">{{ submitting ? "保存中..." : "保存课程内容" }}</button>
        </fieldset>
      </form>
      <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
      <p v-if="success && feedbackVisible" class="state-text" role="status">{{ success }} <a :href="`#catalog-saved-${savedId}`" @click="previewId = savedId">查看该课程已保存内容</a></p>
    </template>
    <ul class="record-list record-list--columns">
      <li v-for="item in catalogItems" :key="item.id">
        <strong>{{ item.title }}</strong>
        <span>编码：{{ item.code }}</span>
        <span>{{ schoolNameById(item.organizationId) }}</span>
        <span>{{ statusText(item.status) }}</span>
        <span v-if="item.templateId">使用共享课程模板</span>
        <button type="button" class="record-action" :disabled="submitting" @click="emit('delete', item.id)">
          删除
        </button>
        <SavedCatalogPreview :id="`catalog-saved-${item.id}`" :catalog="item" :school-label="schoolNameById(item.organizationId)"
          :schools="schools" :tour-sessions="tourSessions.filter(session => session.catalogItemId === item.id)" :expanded="previewId === item.id"
          @update:expanded="open => previewId = open ? item.id : previewId === item.id ? '' : previewId" />
      </li>
    </ul>
  </ConfigurationCard>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"

import type { CatalogItem, CatalogItemPayload, CatalogContentPayload, School, TourSession } from "@/api/configuration"
import ConfigurationCard from "./ConfigurationCard.vue"
import CatalogCoverField from "./CatalogCoverField.vue"
import SavedCatalogPreview from "./SavedCatalogPreview.vue"
import { statusText } from "./format"

const props = withDefaults(defineProps<{
  readonly catalogItems: readonly CatalogItem[]
  readonly error: string
  readonly formError: string
  readonly loading: boolean
  readonly schools: readonly School[]
  readonly submitting: boolean
  readonly tourSessions?: readonly TourSession[]
  readonly success?: string
  readonly savedId?: string
}>(), { tourSessions: () => [], success: "", savedId: "" })

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
const editingTitle = ref("")
const editingStatus = ref("active")
const editingError = ref("")
const editingDescription = ref("")
const editingCover = ref("")
const createUploading = ref(false)
const editUploading = ref(false)
const coverUploading = computed(() => createUploading.value || editUploading.value)
const previewId = ref("")
const feedbackVisible = ref(true)
watch(() => props.success, () => { feedbackVisible.value = true })
const linkedToTemplate = computed(() => !!props.catalogItems.find(item => item.id === editingId.value)?.templateId)
watch([editingId, () => props.catalogItems], () => {
  const item = props.catalogItems.find(item => item.id === editingId.value)
  if (!item) editingId.value = ""
  editingTitle.value = item?.title ?? ""
  editingStatus.value = item?.status ?? "active"
  editingError.value = ""
  editingDescription.value = item?.description ?? ""
  editingCover.value = item?.coverImageUrl ?? ""
})

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
  if (props.submitting || coverUploading.value) return
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
  if (props.submitting || coverUploading.value || linkedToTemplate.value) return
  editingError.value = ""
  if (!editingTitle.value) { editingError.value = "请填写课程名称"; return }
  if (editingId.value !== "") emit("update", { id: editingId.value, payload: { title: editingTitle.value, status: editingStatus.value, description: editingDescription.value, coverImageUrl: editingCover.value } })
}

function schoolNameById(schoolId: string): string {
  return props.schools.find(school => school.id === schoolId)?.name ?? "未关联学校"
}
</script>
