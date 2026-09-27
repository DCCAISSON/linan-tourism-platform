<template>
  <div class="field session-enrollment-scope">
    <label :for="`${inputId}-mode`">招生范围</label>
    <select :id="`${inputId}-mode`" :value="modelValue === null ? 'school' : 'selected'" :disabled="!schoolId" @change="changeMode">
      <option value="school">全校</option>
      <option value="selected">指定年级 / 班级</option>
    </select>
    <template v-if="modelValue !== null">
      <p v-if="loading" class="state-text" role="status">正在加载年级、班级…</p>
      <p v-else-if="error" class="form-error" role="alert">{{ error }} <button type="button" @click="load">重新加载</button></p>
      <p v-else-if="grades.length === 0" class="state-text">当前学校暂无可选年级，请先配置年级。</p>
      <template v-else>
        <label :for="`${inputId}-grades`">可报名年级（可多选）</label>
        <select :id="`${inputId}-grades`" multiple :value="modelValue.map(item => item.gradeId)" @change="changeGrades">
          <option v-for="grade in grades" :key="grade.id" :value="grade.id">{{ grade.name }}</option>
        </select>
        <div v-for="entry in modelValue" :key="entry.gradeId" class="field">
          <label :for="`${inputId}-${entry.gradeId}-mode`">{{ gradeName(entry.gradeId) }}班级范围</label>
          <select :id="`${inputId}-${entry.gradeId}-mode`" :value="entry.classIds === null ? 'all' : 'selected'" @change="changeClassMode(entry.gradeId, $event)">
            <option value="all">全部班级</option>
            <option value="selected">指定班级</option>
          </select>
          <template v-if="entry.classIds !== null">
            <label :for="`${inputId}-${entry.gradeId}-classes`">{{ gradeName(entry.gradeId) }}可报名班级（可多选）</label>
            <select :id="`${inputId}-${entry.gradeId}-classes`" multiple :value="entry.classIds" @change="changeClasses(entry.gradeId, $event)">
              <option v-for="item in classes.filter(item => item.gradeId === entry.gradeId)" :key="item.id" :value="item.id">{{ item.name }}</option>
            </select>
          </template>
        </div>
        <small class="state-text">电脑按住 Ctrl 或 Command 可多选；每个指定年级至少选择一个班级，或选择全部班级。</small>
        <p v-if="!valid" class="form-error">请选择至少一个年级，并完成班级选择。</p>
      </template>
    </template>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { listGrades, listClasses, readableApiError, type EnrollmentScope, type Grade, type SchoolClass } from "@/api/configuration"
const props = defineProps<{ readonly inputId: string; readonly schoolId: string; readonly modelValue: EnrollmentScope }>()
const emit = defineEmits<{ "update:modelValue": [value: EnrollmentScope]; valid: [value: boolean] }>()
const grades = ref<readonly Grade[]>([])
const classes = ref<readonly SchoolClass[]>([])
const loading = ref(false)
const error = ref("")
let requestId = 0
const valid = computed(() => props.modelValue === null || (!loading.value && error.value === "" && props.modelValue.length > 0 && props.modelValue.every(entry => grades.value.some(grade => grade.id === entry.gradeId) && (entry.classIds === null || (entry.classIds.length > 0 && entry.classIds.every(id => classes.value.some(item => item.id === id && item.gradeId === entry.gradeId)))))))
watch(valid, value => emit("valid", value), { immediate: true })
watch(() => props.schoolId, () => { void load() }, { immediate: true })
async function load(): Promise<void> {
  const request = ++requestId
  const schoolId = props.schoolId
  grades.value = []
  classes.value = []
  error.value = ""
  if (!schoolId) return
  loading.value = true
  try {
    const items = (await listGrades(schoolId)).filter(item => item.status === "active")
    const children = (await Promise.all(items.map(item => listClasses(item.id)))).flat().filter(item => item.status === "active")
    if (request !== requestId) return
    grades.value = items
    classes.value = children
  } catch (caught) {
    if (request === requestId) error.value = readableApiError(caught)
  } finally {
    if (request === requestId) loading.value = false
  }
}
function gradeName(id: string): string { return grades.value.find(item => item.id === id)?.name ?? "所选年级" }
function changeMode(event: Event): void {
  if (event.target instanceof HTMLSelectElement) emit("update:modelValue", event.target.value === "school" ? null : [])
}
function changeGrades(event: Event): void {
  if (!(event.target instanceof HTMLSelectElement)) return
  emit("update:modelValue", Array.from(event.target.selectedOptions, item => props.modelValue?.find(entry => entry.gradeId === item.value) ?? { gradeId: item.value, classIds: null }))
}
function changeClassMode(gradeId: string, event: Event): void {
  if (!(event.target instanceof HTMLSelectElement)) return
  const classIds = event.target.value === "all" ? null : []
  emit("update:modelValue", props.modelValue?.map(entry => entry.gradeId === gradeId ? { gradeId, classIds } : entry) ?? null)
}
function changeClasses(gradeId: string, event: Event): void {
  if (!(event.target instanceof HTMLSelectElement)) return
  const classIds = Array.from(event.target.selectedOptions, item => item.value)
  emit("update:modelValue", props.modelValue?.map(entry => entry.gradeId === gradeId ? { gradeId, classIds } : entry) ?? null)
}
</script>
<style scoped>
.session-enrollment-scope { grid-column: 1 / -1; }
</style>
