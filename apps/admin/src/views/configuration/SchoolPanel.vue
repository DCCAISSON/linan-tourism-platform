<template>
  <ConfigurationCard
    empty-text="暂无学校，请先新增学校。"
    :count="schools.length"
    :error="error"
    :loading="loading"
    title="学校"
    title-id="school-title"
  >
    <template #form>
      <form class="configuration-form" @submit.prevent="submit">
        <fieldset :disabled="submitting">
          <div class="field">
            <label for="school-name">学校名称</label>
            <input id="school-name" v-model.trim="name" autocomplete="off" />
          </div>
          <div class="field">
            <label for="school-code">学校编码</label>
            <input id="school-code" v-model.trim="code" autocomplete="off" />
          </div>
          <p v-if="visibleError" class="form-error">{{ visibleError }}</p>
          <button type="submit" :disabled="submitting">
            {{ submitting ? "提交中..." : "新增学校" }}
          </button>
        </fieldset>
      </form>
    </template>
    <ul class="record-list">
      <li v-for="school in schools" :key="school.id">
        <strong>{{ school.name }}</strong>
        <span>编码：{{ school.code }}</span>
        <span>启用</span>
        <button type="button" class="record-action" :disabled="submitting" @click="emit('delete', school.id)">
          删除
        </button>
      </li>
    </ul>
  </ConfigurationCard>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"

import type { School, SchoolPayload } from "@/api/configuration"
import ConfigurationCard from "./ConfigurationCard.vue"

const props = defineProps<{
  readonly error: string
  readonly formError: string
  readonly loading: boolean
  readonly schools: readonly School[]
  readonly submitting: boolean
}>()

const emit = defineEmits<{
  create: [payload: SchoolPayload]
  delete: [id: string]
}>()

const code = ref("")
const localError = ref("")
const name = ref("")

const visibleError = computed(() => localError.value || props.formError)

function submit(): void {
  localError.value = ""

  if (name.value === "" || code.value === "") {
    localError.value = "请填写学校名称和学校编码"
    return
  }

  emit("create", { name: name.value, code: code.value })
}
</script>
