<template>
  <ConfigurationCard
    empty-text="暂无班级，请先新增班级。"
    :count="classes.length"
    :error="error"
    :loading="loading"
    title="班级"
    title-id="class-title"
  >
    <template #form>
      <form class="configuration-form" @submit.prevent="submit">
        <fieldset :disabled="submitting || grades.length === 0">
          <div class="field">
            <label for="class-grade">所属年级</label>
            <select id="class-grade" :value="selectedGradeId" @change="selectGrade">
              <option value="">请选择年级</option>
              <option v-for="grade in grades" :key="grade.id" :value="grade.id">
                {{ grade.name }}
              </option>
            </select>
          </div>
          <div class="field">
            <label for="class-code">班级编码</label>
            <input id="class-code" v-model.trim="code" autocomplete="off" />
          </div>
          <div class="field">
            <label for="class-name">班级名称</label>
            <input id="class-name" v-model.trim="name" autocomplete="off" />
          </div>
          <p v-if="visibleError" class="form-error">{{ visibleError }}</p>
          <button type="submit" :disabled="submitting || grades.length === 0">
            {{ submitting ? "提交中..." : "新增班级" }}
          </button>
        </fieldset>
      </form>
    </template>
    <ul class="record-list">
      <li v-for="schoolClass in classes" :key="schoolClass.id">
        <strong>{{ schoolClass.name }}</strong>
        <span>编码：{{ schoolClass.code }}</span>
        <span>{{ statusText(schoolClass.status) }}</span>
        <button type="button" class="record-action" :disabled="submitting" @click="emit('delete', schoolClass.id)">
          删除
        </button>
      </li>
    </ul>
  </ConfigurationCard>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"

import type { ClassPayload, Grade, SchoolClass } from "@/api/configuration"
import ConfigurationCard from "./ConfigurationCard.vue"
import { statusText } from "./format"

const props = defineProps<{
  readonly classes: readonly SchoolClass[]
  readonly error: string
  readonly formError: string
  readonly grades: readonly Grade[]
  readonly loading: boolean
  readonly selectedGradeId: string
  readonly submitting: boolean
}>()

const emit = defineEmits<{
  create: [payload: ClassPayload]
  delete: [id: string]
  selectGrade: [gradeId: string]
}>()

const code = ref("")
const localError = ref("")
const name = ref("")

const visibleError = computed(() => localError.value || props.formError)

function selectGrade(event: Event): void {
  const target = event.target
  if (target instanceof HTMLSelectElement) {
    emit("selectGrade", target.value)
  }
}

function submit(): void {
  localError.value = ""

  if (props.selectedGradeId === "" || name.value === "" || code.value === "") {
    localError.value = "请选择年级，并填写班级编码和名称"
    return
  }

  emit("create", { code: code.value, name: name.value })
}
</script>
