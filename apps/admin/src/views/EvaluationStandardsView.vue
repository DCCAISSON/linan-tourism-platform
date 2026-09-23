<template>
  <section class="evaluation-page" aria-labelledby="standard-title">
    <header class="evaluation-card evaluation-heading">
      <div>
        <p class="evaluation-eyebrow">评价标准</p>
        <h2 id="standard-title">标准版本维护</h2>
        <p>标准必须明确 A/B 标签；未确认标准不能用于学校报告。</p>
      </div>
    </header>
    <section class="evaluation-card">
      <form class="evaluation-form" @submit.prevent="save">
        <label class="evaluation-field">团期 ID<input v-model="form.tourSessionId" required maxlength="64" /></label>
        <label class="evaluation-field">标题<input v-model="form.title" required maxlength="120" /></label>
        <label class="evaluation-field">A 等级说明<input v-model="aLabel" required maxlength="80" /></label>
        <label class="evaluation-field">B 等级说明<input v-model="bLabel" required maxlength="80" /></label>
        <button type="submit" class="evaluation-button" :disabled="saving">{{ saving ? "保存中..." : "保存标准草稿" }}</button>
      </form>
      <p v-if="message" class="evaluation-state">{{ message }}</p>
      <p v-if="error" class="evaluation-error" role="alert">{{ error }}</p>
    </section>
  </section>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue"
import { createEvaluationStandard } from "@/api/evaluations"
import { readableRosterError } from "@/api/roster.errors"
import "@/styles/evaluations.css"

const form = reactive({ tourSessionId: "", title: "研学表现等级" })
const aLabel = ref("表现优秀")
const bLabel = ref("达到要求")
const saving = ref(false)
const message = ref("")
const error = ref("")

async function save(): Promise<void> {
  saving.value = true
  message.value = ""
  error.value = ""
  try {
    const result = await createEvaluationStandard({
      tourSessionId: form.tourSessionId.trim(),
      title: form.title.trim(),
      publicFormatNote: "基础格式，未获得正式模板",
      items: [
        { code: "A", label: aLabel.value.trim(), description: aLabel.value.trim() },
        { code: "B", label: bLabel.value.trim(), description: bLabel.value.trim() },
      ],
    })
    message.value = `标准已保存：${result.title}，待确认后用于 A/B。`
  } catch (cause) { error.value = readableRosterError(cause) }
  finally { saving.value = false }
}
</script>
