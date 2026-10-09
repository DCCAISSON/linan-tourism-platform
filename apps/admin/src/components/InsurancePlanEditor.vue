<template>
  <section class="insurance-card insurance-plan" aria-labelledby="insurance-plan-title">
    <h3 id="insurance-plan-title">团期保险方案</h3>
    <p class="insurance-state">保存后，家长可在订单的“出行保障”中查看。新生成的批次使用已保存方案，已有批次保持原方案；方案说明不代表已承保。</p>
    <p v-if="loading" role="status">正在读取保险方案…</p>
    <form v-else-if="loaded" @submit.prevent="save">
      <fieldset :disabled="working || !canWrite">
        <legend>{{ savedPlan === null ? "尚未配置方案" : "当前方案" }}</legend>
        <div class="insurance-action-grid">
          <label>保险公司<input v-model="insurerName" maxlength="120" required></label>
          <label>方案名称<input v-model="planName" maxlength="120" required></label>
        </div>
        <label>保障内容<textarea v-model="coverageSummary" rows="4" maxlength="4000" required placeholder="根据正式方案填写保障项目、保额及适用范围"></textarea></label>
        <label>投保须知（选填）<textarea v-model="notice" rows="3" maxlength="2000" placeholder="填写家长需要了解的适用条件、免责说明等"></textarea></label>
        <div v-if="canWrite" class="insurance-actions">
          <button type="submit">{{ working ? "保存中…" : "保存保险方案" }}</button>
          <button v-if="savedPlan !== null" type="button" class="insurance-plan__clear" @click="clearPlan">清除当前方案</button>
        </div>
      </fieldset>
      <p v-if="!canWrite" class="insurance-state">当前账号可查看方案，修改请联系负责保险的工作人员。</p>
    </form>
    <p v-if="error" class="insurance-state insurance-state--error" role="alert">{{ error }}</p>
    <div v-if="!loaded && !loading" class="insurance-actions"><button type="button" @click="load">重新读取方案</button></div>
    <p v-if="message" class="insurance-state" role="status">{{ message }}</p>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue"
import { getSessionInsurancePlan, readableInsuranceError, saveSessionInsurancePlan } from "@/api/insurance"
import type { InsurancePlan } from "@/api/insurance"

const props = defineProps<{ readonly tourSessionId: string; readonly canWrite: boolean }>()
const savedPlan = ref<InsurancePlan | null>(null)
const insurerName = ref("")
const planName = ref("")
const coverageSummary = ref("")
const notice = ref("")
const loading = ref(true)
const loaded = ref(false)
const working = ref(false)
const error = ref("")
const message = ref("")
let active = true

onMounted(load)
onBeforeUnmount(() => { active = false })

function showPlan(plan: InsurancePlan | null): void {
  savedPlan.value = plan
  insurerName.value = plan?.insurerName ?? ""
  planName.value = plan?.planName ?? ""
  coverageSummary.value = plan?.coverageSummary ?? ""
  notice.value = plan?.notice ?? ""
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ""
  try {
    const result = await getSessionInsurancePlan(props.tourSessionId)
    if (!active) return
    showPlan(result.plan)
    loaded.value = true
  } catch (caught) { if (active) error.value = readableInsuranceError(caught) }
  finally { if (active) loading.value = false }
}

async function save(): Promise<void> {
  if (!canSave()) return
  const plan = { insurerName: insurerName.value.trim(), planName: planName.value.trim(), coverageSummary: coverageSummary.value.trim(), notice: notice.value.trim() || null }
  if (!plan.insurerName || !plan.planName || !plan.coverageSummary) {
    error.value = "请填写保险公司、方案名称和保障内容。"
    return
  }
  await persist(plan)
}

async function clearPlan(): Promise<void> {
  if (!canSave() || !window.confirm("清除当前团期的保险方案？已有批次的方案和保单记录会保留。")) return
  await persist(null)
}

function canSave(): boolean { return active && loaded.value && props.canWrite && !working.value }

async function persist(plan: InsurancePlan | null): Promise<void> {
  working.value = true
  error.value = ""
  message.value = ""
  try {
    const result = await saveSessionInsurancePlan(props.tourSessionId, plan)
    if (!active) return
    showPlan(result.plan)
    message.value = result.plan === null ? "当前方案已清除，已有批次和保单记录保持不变。" : "方案已保存，家长可查看；已有批次保持原方案。"
  } catch (caught) { if (active) error.value = readableInsuranceError(caught) }
  finally { if (active) working.value = false }
}
</script>
