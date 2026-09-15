<template>
  <ConfigurationCard
    empty-text="暂无年级，请先新增年级。"
    :count="grades.length"
    :error="error"
    :loading="loading"
    title="年级"
    title-id="grade-title"
  >
    <template #form>
      <form class="configuration-form" @submit.prevent="submit">
        <fieldset :disabled="submitting || schools.length === 0">
          <div class="field">
            <label for="grade-school">所属学校</label>
            <select id="grade-school" :value="selectedSchoolId" @change="selectSchool">
              <option value="">请选择学校</option>
              <option v-for="school in schools" :key="school.id" :value="school.id">
                {{ school.name }}
              </option>
            </select>
          </div>
          <div class="field">
            <label for="grade-code">年级编码</label>
            <input id="grade-code" v-model.trim="code" autocomplete="off" />
          </div>
          <div class="field">
            <label for="grade-name">年级名称</label>
            <input id="grade-name" v-model.trim="name" autocomplete="off" />
          </div>
          <p v-if="visibleError" class="form-error">{{ visibleError }}</p>
          <button type="submit" :disabled="submitting || schools.length === 0">
            {{ submitting ? "提交中..." : "新增年级" }}
          </button>
        </fieldset>
      </form>
    </template>
    <ul class="record-list">
      <li v-for="grade in grades" :key="grade.id">
        <strong>{{ grade.name }}</strong>
        <span>编码：{{ grade.code }}</span>
        <span>{{ statusText(grade.status) }}</span>
        <button type="button" class="record-action" :disabled="submitting" @click="emit('delete', grade.id)">
          删除
        </button>
      </li>
    </ul>
  </ConfigurationCard>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"

import type { Grade, GradePayload, School } from "@/api/configuration"
import ConfigurationCard from "./ConfigurationCard.vue"
import { statusText } from "./format"

const props = defineProps<{
  readonly error: string
  readonly formError: string
  readonly grades: readonly Grade[]
  readonly loading: boolean
  readonly schools: readonly School[]
  readonly selectedSchoolId: string
  readonly submitting: boolean
}>()

const emit = defineEmits<{
  create: [payload: GradePayload]
  delete: [id: string]
  selectSchool: [schoolId: string]
}>()

const code = ref("")
const localError = ref("")
const name = ref("")

const visibleError = computed(() => localError.value || props.formError)

function selectSchool(event: Event): void {
  const target = event.target
  if (target instanceof HTMLSelectElement) {
    emit("selectSchool", target.value)
  }
}

function submit(): void {
  localError.value = ""

  if (props.selectedSchoolId === "" || name.value === "" || code.value === "") {
    localError.value = "请选择学校，并填写年级编码和名称"
    return
  }

  emit("create", { code: code.value, name: name.value })
}
</script>
