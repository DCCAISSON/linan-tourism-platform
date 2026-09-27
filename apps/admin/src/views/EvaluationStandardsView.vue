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
        <label class="evaluation-field">A 等级说明<input v-model="aLabel" readonly /></label>
        <label class="evaluation-field">A 判定规则<input v-model="aDescription" required maxlength="300" /></label>
        <label class="evaluation-field">B 等级说明<input v-model="bLabel" readonly /></label>
        <label class="evaluation-field">B 判定规则<input v-model="bDescription" required maxlength="300" /></label>
        <fieldset class="evaluation-card evaluation-form">
          <legend>观察项目（可选）</legend>
          <p class="evaluation-state">项目用于记录具体表现，等级仍由导游按已确认规则判断。可不设置观察项目。</p>
          <button type="button" class="evaluation-button" :disabled="saving" @click="useSuggestions">使用研学观察建议</button>
          <p class="evaluation-state">以下建议依据已有研学材料及浙江省研学旅行课程指南整理，可编辑或删除，保存并确认后才用于本团期。各项只辅助观察，不计分、不自动推导等级；没有相关活动或未观察到时，不据此判断表现差。</p>
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
        <p v-if="loadedSession && standards.length === 0" class="evaluation-state">暂无标准，请核对并保存本团期的等级说明和判定规则。</p>
        <article v-for="standard in standards" :key="standard.id" class="evaluation-card">
          <h3>{{ standard.title }}<span style="white-space: nowrap">（版本 {{ standard.version }}）</span></h3>
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
const aLabel = ref("优秀")
const bLabel = ref("合格")
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

function useSuggestions(): void {
  if (dimensions.value.length > 0 && !window.confirm("将替换当前草稿中的观察项目，已保存的标准保持不变。是否继续？")) return
  dimensions.value = [
    { code: "safety", label: "遵守安全提示", description: "听取乘车和活动安全说明，按要求使用器材，需要帮助时及时告知导游或老师。" },
    { code: "schedule", label: "遵守集合与活动安排", description: "按集合要求归队，随集体行动，有事先向带队人员说明。" },
    { code: "participation", label: "参与研学活动", description: "参与参观、体验或实践任务，愿意尝试适合自己的活动。" },
    { code: "learning", label: "认真观察与学习", description: "留意讲解和现场事物，通过观察、提问、记录等方式了解学习内容。" },
    { code: "teamwork", label: "与同伴合作", description: "参与分工，听取同伴意见，愿意帮助他人并共同完成任务。" },
    { code: "care", label: "爱护环境与公共设施", description: "保持活动场所整洁，爱护物品和设施，用餐文明。" },
    { code: "sharing", label: "表达与分享收获", description: "用口述、记录、作品等适合自己的方式分享发现或活动感受。" },
  ]
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
  if (!window.confirm("请核对本团期的 A/B 规则及观察项目。确认后可用于本团期评价，是否继续？")) return
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
