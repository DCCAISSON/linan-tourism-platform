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
      <form class="evaluation-form" @submit.prevent="load">
        <label class="evaluation-field">团期 ID<input v-model="form.tourSessionId" required maxlength="64" /></label>
        <button class="evaluation-button" :disabled="saving">加载标准</button>
      </form>
      <form v-if="canWrite && loadedSession === form.tourSessionId.trim()" class="evaluation-form" @submit.prevent="save">
        <label class="evaluation-field">标题<input v-model="form.title" required maxlength="120" /></label>
        <label class="evaluation-field">A 等级说明<input v-model="aLabel" required maxlength="80" /></label>
        <label class="evaluation-field">A 判定规则<input v-model="aDescription" required maxlength="300" /></label>
        <label class="evaluation-field">B 等级说明<input v-model="bLabel" required maxlength="80" /></label>
        <label class="evaluation-field">B 判定规则<input v-model="bDescription" required maxlength="300" /></label>
        <fieldset class="evaluation-card evaluation-form">
          <legend>观察项目（可选）</legend>
          <p class="evaluation-state">项目用于记录具体表现，等级仍由导游按已确认规则判断。可不设置观察项目。</p>
          <div v-for="(dimension, index) in dimensions" :key="dimension.code" class="evaluation-form">
            <label class="evaluation-field">项目 {{ index + 1 }} 名称<input v-model="dimension.label" required maxlength="80" :disabled="saving" /></label>
            <label class="evaluation-field">项目 {{ index + 1 }} 观察说明<input v-model="dimension.description" maxlength="300" :disabled="saving" /></label>
            <button type="button" class="evaluation-button" :disabled="saving" @click="dimensions.splice(index, 1)">移除项目 {{ index + 1 }}</button>
          </div>
          <button type="button" class="evaluation-button" :disabled="saving || dimensions.length >= 32" @click="addDimension">添加观察项目</button>
        </fieldset>
        <button type="submit" class="evaluation-button" :disabled="saving">{{ saving ? "保存中..." : "保存标准草稿" }}</button>
      </form>
      <p v-if="message" class="evaluation-state">{{ message }}</p>
      <p v-if="error" class="evaluation-error" role="alert">{{ error }}</p>
      <template v-if="loadedSession === form.tourSessionId.trim()">
        <p v-if="loadedSession && standards.length === 0" class="evaluation-state">暂无标准，请填写学校确认的等级说明和判定规则。</p>
        <article v-for="standard in standards" :key="standard.id" class="evaluation-card">
          <h3>{{ standard.title }}（版本 {{ standard.version }}）</h3>
          <p v-for="item in standard.items" :key="item.code">{{ item.code }} · {{ item.label }}：{{ item.description }}</p>
          <p v-for="dimension in standard.dimensions" :key="dimension.code">观察项目：{{ dimension.label }}{{ dimension.description ? ` · ${dimension.description}` : '' }}</p>
          <p>{{ standard.confirmedAt ? '已确认' : '草稿，不能用于评级' }}</p>
          <button v-if="canConfirm && !standard.confirmedAt" class="evaluation-button" :disabled="saving" @click="confirm(standard)">确认此标准</button>
        </article>
      </template>
    </section>
  </section>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue"
import { getCurrentStaff } from "@/api/auth"
import { confirmEvaluationStandard, createEvaluationStandard, loadEvaluationStandards, type EvaluationStandardSummary } from "@/api/evaluations"
import { readableRosterError } from "@/api/roster.errors"
import "@/styles/evaluations.css"

const form = reactive({ tourSessionId: "", title: "" })
const aLabel = ref("")
const bLabel = ref("")
const aDescription = ref("")
const bDescription = ref("")
const dimensions = ref<{ code: string; label: string; description: string }[]>([])
const standards = ref<readonly EvaluationStandardSummary[]>([])
const loadedSession = ref("")
const canWrite = ref(false)
const canConfirm = ref(false)
const saving = ref(false)
const message = ref("")
const error = ref("")

function addDimension(): void {
  dimensions.value.push({ code: `d_${crypto.randomUUID()}`, label: "", description: "" })
}

async function load(): Promise<void> {
  saving.value = true
  error.value = ""
  message.value = ""
  loadedSession.value = ""
  try {
    const [staff, result] = await Promise.all([getCurrentStaff(), loadEvaluationStandards(form.tourSessionId.trim())])
    canWrite.value = staff.permissionKeys.includes("evaluations.standard.write")
    canConfirm.value = staff.permissionKeys.includes("evaluations.standard.confirm")
    standards.value = result
    loadedSession.value = form.tourSessionId.trim()
  } catch (cause) { error.value = readableRosterError(cause) }
  finally { saving.value = false }
}

async function confirm(standard: EvaluationStandardSummary): Promise<void> {
  if (!window.confirm("请确认上述 A/B 规则及观察项目已经学校确认。确认后可用于本团期评价，是否继续？")) return
  saving.value = true
  error.value = ""
  try {
    const result = await confirmEvaluationStandard(standard.id, standard.version)
    standards.value = standards.value.map((row) => row.id === result.id ? result : row)
    message.value = "标准已确认，可用于本团期评级。"
  } catch (cause) { error.value = readableRosterError(cause) }
  finally { saving.value = false }
}

async function save(): Promise<void> {
  saving.value = true
  message.value = ""
  error.value = ""
  try {
    const result = await createEvaluationStandard({
      tourSessionId: form.tourSessionId.trim(),
      title: form.title.trim(),
      publicFormatNote: "基础格式，未获得正式模板",
      dimensions: dimensions.value.map((dimension) => ({ code: dimension.code, label: dimension.label.trim(), description: dimension.description.trim() })),
      items: [
        { code: "A", label: aLabel.value.trim(), description: aDescription.value.trim() },
        { code: "B", label: bLabel.value.trim(), description: bDescription.value.trim() },
      ],
    })
    message.value = `标准已保存：${result.title}，待确认后用于 A/B。`
    standards.value = [result, ...standards.value]
  } catch (cause) { error.value = readableRosterError(cause) }
  finally { saving.value = false }
}
</script>
