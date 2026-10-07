<template>
  <ConfigurationCard title="共享课程模板" title-id="catalog-template-title" :count="templates.length"
    empty-text="暂无模板，可先保存一份公共课程内容，再关联学校。" :loading="loading" :error="loadError" wide>
    <template #form>
      <p class="state-text">同一课程内容供多校使用；各校团期的日期、价格和招生范围仍在下方团期中单独设置。</p>
      <form class="configuration-form configuration-form--grid" @submit.prevent="save">
        <fieldset :disabled="submitting || loading">
          <div class="field">
            <label for="catalog-template-select">选择课程模板</label>
            <select id="catalog-template-select" v-model="selectedId">
              <option value="">新建模板</option>
              <option v-for="template in templates" :key="template.id" :value="template.id">{{ template.title }}</option>
            </select>
          </div>
          <div class="field">
            <label for="catalog-template-name">模板名称</label>
            <input id="catalog-template-name" v-model.trim="title" maxlength="160" required />
          </div>
          <div class="field configuration-content-field">
            <label for="catalog-template-description">模板课程介绍</label>
            <textarea id="catalog-template-description" v-model="description" maxlength="4000" rows="3" />
          </div>
          <CatalogCoverField :key="selectedId" id="catalog-template-cover" v-model="coverImageUrl" label="模板封面"
            save-hint="保存共享内容后生效" :disabled="submitting || loading" @uploading="uploading = $event" />
          <p v-if="selectedId" class="state-text configuration-content-field">保存后，已关联的 {{ linkedItems.length }} 个学校课程同步名称、介绍和封面。</p>
          <button type="submit" :disabled="uploading">{{ submitting ? '保存中...' : selectedId ? '保存共享内容' : '新建课程模板' }}</button>
        </fieldset>
      </form>
      <form v-if="selectedId" class="configuration-form configuration-form--grid" @submit.prevent="linkSchool">
        <fieldset :disabled="submitting || loading">
          <legend class="configuration-form__legend">关联学校课程</legend>
          <div class="field">
            <label for="template-school">模板关联学校</label>
            <select id="template-school" v-model="schoolId" required>
              <option value="">请选择学校</option>
              <option v-for="school in schools" :key="school.id" :value="school.id">{{ school.name }}</option>
            </select>
          </div>
          <div class="field">
            <label for="template-school-course">学校课程</label>
            <select id="template-school-course" v-model="catalogId" :disabled="!schoolId">
              <option value="">新增学校课程</option>
              <option v-for="item in schoolItems" :key="item.id" :value="item.id">{{ item.title }}（{{ item.code }}）</option>
            </select>
          </div>
          <div v-if="!catalogId" class="field">
            <label for="template-school-code">新学校课程编码</label>
            <input id="template-school-code" v-model.trim="code" maxlength="64" required />
          </div>
          <p class="state-text configuration-content-field">关联将使用当前已保存的模板名称、介绍和封面，保留学校课程编号、团期设置与历史订单。</p>
          <button type="submit" :disabled="!schoolId">{{ submitting ? '关联中...' : catalogId ? '替换公共内容并关联' : '关联学校' }}</button>
        </fieldset>
      </form>
      <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
      <p v-if="success" class="state-text" role="status">{{ success }} <a v-if="savedTemplateId" :href="`#template-saved-${savedTemplateId}`" @click="previewOpen = true">查看该模板已保存内容</a></p>
      <SavedCatalogPreview v-if="selected" :id="`template-saved-${selected.id}`" :key="selected.id" :catalog="selected"
        :school-label="linkedItems.map(item => schoolName(item.organizationId)).join('、') || '尚未关联学校'" :schools="schools"
        :tour-sessions="tourSessions.filter(session => linkedItems.some(item => item.id === session.catalogItemId))" v-model:expanded="previewOpen" />
      <button v-if="loadError || formError" type="button" class="record-action" :disabled="loading || submitting" @click="load">刷新模板</button>
    </template>
    <ul v-if="selectedId" class="record-list record-list--columns catalog-template-links">
      <li v-for="item in linkedItems" :key="item.id">
        <strong>{{ schoolName(item.organizationId) }}</strong>
        <span>{{ item.title }} · {{ item.code }}</span>
        <button type="button" class="record-action" :disabled="submitting" @click="unlink(item.id)">解除关联，保留当前内容</button>
      </li>
    </ul>
  </ConfigurationCard>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import {
  addTemplateSchool, createCatalogTemplate, linkCatalogTemplate, listCatalogTemplates, readableApiError, updateCatalogTemplate,
  type CatalogItem, type CatalogTemplate, type School, type TourSession,
} from "@/api/configuration"
import ConfigurationCard from "./ConfigurationCard.vue"
import CatalogCoverField from "./CatalogCoverField.vue"
import SavedCatalogPreview from "./SavedCatalogPreview.vue"

const props = withDefaults(defineProps<{ readonly schools: readonly School[]; readonly catalogItems: readonly CatalogItem[]; readonly tourSessions?: readonly TourSession[] }>(), { tourSessions: () => [] })
const emit = defineEmits<{ changed: [] }>()
const templates = ref<readonly CatalogTemplate[]>([])
const selectedId = ref("")
const title = ref("")
const description = ref("")
const coverImageUrl = ref("")
const schoolId = ref("")
const catalogId = ref("")
const code = ref("")
const loading = ref(false)
const submitting = ref(false)
const loadError = ref("")
const formError = ref("")
const success = ref("")
const uploading = ref(false)
const savedTemplateId = ref("")
const previewOpen = ref(false)
const selected = computed(() => templates.value.find(item => item.id === selectedId.value))
const schoolItems = computed(() => props.catalogItems.filter(item => item.organizationId === schoolId.value))
const linkedItems = computed(() => props.catalogItems.filter(item => item.templateId === selectedId.value))
watch(selected, template => {
  title.value = template?.title ?? ""
  description.value = template?.description ?? ""
  coverImageUrl.value = template?.coverImageUrl ?? ""
})
watch(schoolId, () => { catalogId.value = "" })
watch(selectedId, () => { success.value = ""; savedTemplateId.value = ""; previewOpen.value = false }, { flush: "sync" })
onMounted(load)

async function load(): Promise<void> {
  loading.value = true
  loadError.value = ""
  try { templates.value = await listCatalogTemplates(); formError.value = "" }
  catch (error) { loadError.value = readableApiError(error) }
  finally { loading.value = false }
}

async function save(): Promise<void> {
  if (submitting.value || uploading.value) return
  submitting.value = true
  formError.value = ""
  success.value = ""
  savedTemplateId.value = ""
  try {
    const content = { title: title.value, description: description.value, coverImageUrl: coverImageUrl.value }
    const template = selected.value === undefined
      ? await createCatalogTemplate(content)
      : await updateCatalogTemplate(selected.value.id, { ...content, expectedVersion: selected.value.version })
    templates.value = [...templates.value.filter(item => item.id !== template.id), template]
    selectedId.value = template.id
    savedTemplateId.value = template.id
    success.value = "课程模板已保存。已关联学校同步更新；小程序重新进入相应页面后显示更新，团期状态不变。"
    emit("changed")
  } catch (error) { formError.value = readableApiError(error) }
  finally { submitting.value = false }
}

async function linkSchool(): Promise<void> {
  if (!selectedId.value || !schoolId.value) return
  submitting.value = true
  formError.value = ""
  success.value = ""
  try {
    if (catalogId.value) await linkCatalogTemplate(catalogId.value, selectedId.value)
    else await addTemplateSchool(selectedId.value, { organizationId: schoolId.value, code: code.value })
    success.value = "学校课程已关联，可在团期中设置日期、价格和招生范围"
    emit("changed")
  } catch (error) { formError.value = readableApiError(error) }
  finally { submitting.value = false }
}

async function unlink(id: string): Promise<void> {
  submitting.value = true
  formError.value = ""
  success.value = ""
  try {
    await linkCatalogTemplate(id, null)
    success.value = "已解除关联，学校课程保留当前内容"
    emit("changed")
  } catch (error) { formError.value = readableApiError(error) }
  finally { submitting.value = false }
}

function schoolName(id: string): string { return props.schools.find(item => item.id === id)?.name ?? "学校" }
</script>

<style scoped>
.catalog-template-links > li {
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) auto;
}
@media (max-width: 1024px) {
  .catalog-template-links > li { grid-template-columns: 1fr; }
}
</style>
