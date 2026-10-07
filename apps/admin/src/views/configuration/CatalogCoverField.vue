<template>
  <div class="field configuration-content-field catalog-cover-field">
    <label :for="`${id}-file`">{{ label }}：选择本地图片</label>
    <input :id="`${id}-file`" type="file" accept="image/png,image/jpeg,image/webp" :disabled="disabled || uploading"
      :aria-describedby="`${id}-help`" @change="selectFile" />
    <small :id="`${id}-help`" class="state-text">PNG、JPEG 或 WebP，最大 5MB；也可在下方填写 HTTPS 图片链接。封面将公开展示，请使用自有或已获授权的宣传图片。</small>
    <label :for="id">{{ label }}链接</label>
    <input :id="id" :value="modelValue" type="url" maxlength="2048" :disabled="disabled || uploading"
      placeholder="https://…" @input="editUrl" />
    <img v-if="modelValue && !previewFailed" class="catalog-cover-preview" :src="modelValue" alt="当前封面预览" @error="previewFailed = true" />
    <p v-if="previewFailed" class="state-text">封面暂无法预览，请检查图片链接或重新选择图片。</p>
    <p v-if="uploading" class="state-text" role="status">封面上传中，请稍候…</p>
    <p v-else-if="uploaded" class="state-text" role="status">封面已上传，{{ saveHint }}。</p>
    <p v-if="error" class="form-error" role="alert">{{ error }}。原封面链接未改变。</p>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue"
import { uploadCatalogCover } from "@/api/catalog-cover"
import { readableApiError } from "@/api/configuration"

const props = withDefaults(defineProps<{
  readonly id: string
  readonly modelValue: string
  readonly disabled?: boolean
  readonly label?: string
  readonly saveHint?: string
}>(), { disabled: false, label: "封面", saveHint: "保存课程后生效" })
const emit = defineEmits<{ "update:modelValue": [value: string]; uploading: [value: boolean] }>()
const uploading = ref(false)
const uploaded = ref(false)
const error = ref("")
const previewFailed = ref(false)
let active = true
watch(() => props.modelValue, () => { previewFailed.value = false })
onBeforeUnmount(() => { active = false; emit("uploading", false) })

function editUrl(event: Event): void {
  if (!(event.target instanceof HTMLInputElement)) return
  uploaded.value = false
  error.value = ""
  emit("update:modelValue", event.target.value.trim())
}

async function selectFile(event: Event): Promise<void> {
  if (!(event.target instanceof HTMLInputElement) || props.disabled || uploading.value) return
  const file = event.target.files?.item(0)
  event.target.value = ""
  if (!file) return
  uploading.value = true
  uploaded.value = false
  error.value = ""
  emit("uploading", true)
  try {
    const url = await uploadCatalogCover(file)
    if (!active) return
    emit("update:modelValue", url)
    uploaded.value = true
  } catch (caught) {
    if (active) error.value = readableApiError(caught)
  } finally {
    if (active) { uploading.value = false; emit("uploading", false) }
  }
}
</script>

<style scoped>
.catalog-cover-preview { display: block; width: 100%; max-width: calc(var(--space-10) * 5); aspect-ratio: 16 / 9; object-fit: cover; border-radius: var(--radius-control); background: var(--brand-mist); }
.catalog-cover-field input[type="file"] { min-width: 0; }
</style>
