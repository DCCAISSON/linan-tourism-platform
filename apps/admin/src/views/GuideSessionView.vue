<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue"
import { useRoute } from "vue-router"
import { createExecutionEvent, getGuideSession, readableExecutionError, saveAttendance, saveDailyReport, type GuidePerson, type GuideSession } from "../api/execution"

const route = useRoute()
const sessionId = computed(() => String(route.params["sessionId"] ?? route.query["sessionId"] ?? ""))
const loading = ref(false)
const saving = ref(false)
const error = ref("")
const session = ref<GuideSession | null>(null)
const today = new Date().toISOString().slice(0, 10)
const daily = reactive({ reportDate: today, lodgingCheck: "", mealStatus: "", bodyStatus: "", note: "" })
const eventForm = reactive({ category: "objective" as const, occurredAt: new Date().toISOString(), personRef: "", content: "" })

async function load(): Promise<void> {
  if (sessionId.value.length === 0) return
  loading.value = true
  error.value = ""
  try { session.value = await getGuideSession(sessionId.value) }
  catch (cause) { error.value = readableExecutionError(cause) }
  finally { loading.value = false }
}

async function mark(person: GuidePerson, status: "present" | "absent" | "revoked"): Promise<void> {
  saving.value = true
  error.value = ""
  try {
    await saveAttendance(sessionId.value, person.personRef, { status, infoChecked: status === "revoked" ? false : true, groupJoined: status === "present", note: "" })
    await load()
  } catch (cause) { error.value = readableExecutionError(cause) }
  finally { saving.value = false }
}

async function submitDaily(): Promise<void> {
  saving.value = true
  error.value = ""
  try { await saveDailyReport(sessionId.value, daily); await load() }
  catch (cause) { error.value = readableExecutionError(cause) }
  finally { saving.value = false }
}

async function submitEvent(): Promise<void> {
  saving.value = true
  error.value = ""
  try {
    await createExecutionEvent(sessionId.value, { ...eventForm, personRef: eventForm.personRef.length === 0 ? null : eventForm.personRef as never })
    eventForm.content = ""
    await load()
  } catch (cause) { error.value = readableExecutionError(cause) }
  finally { saving.value = false }
}

onMounted(() => { void load() })
</script>

<template>
  <main class="guide-session">
    <header class="toolbar">
      <div><p class="eyebrow">执行台</p><h1>{{ session?.code ?? '团期执行' }}</h1></div>
      <el-button :loading="loading" @click="load">刷新</el-button>
    </header>
    <el-alert v-if="error" type="error" :title="error" show-icon />
    <section class="panel">
      <h2>逐人点名</h2>
      <div class="people-list">
        <article v-for="person in session?.people ?? []" :key="person.personRef" class="person-row" :class="{ inactive: !person.active }">
          <div>
            <strong>{{ person.displayName }}</strong>
            <p>{{ person.className ?? '未分班' }} · 车辆 {{ person.vehicleId }} · {{ person.attendance?.status ?? '未点名' }}</p>
            <p v-if="!person.active">不可新增点名：{{ person.inactiveReason }}</p>
          </div>
          <div class="actions">
            <el-button size="small" type="success" :disabled="saving || !person.active" @click="mark(person, 'present')">到齐</el-button>
            <el-button size="small" :disabled="saving || !person.active" @click="mark(person, 'absent')">未到</el-button>
            <el-button size="small" type="warning" :disabled="saving" @click="mark(person, 'revoked')">撤销</el-button>
          </div>
        </article>
      </div>
    </section>
    <section class="panel form-grid">
      <div>
        <h2>日报事实</h2>
        <el-form label-position="top">
          <el-form-item label="日期"><el-input v-model="daily.reportDate" /></el-form-item>
          <el-form-item label="住宿查房"><el-input v-model="daily.lodgingCheck" type="textarea" /></el-form-item>
          <el-form-item label="餐饮情况"><el-input v-model="daily.mealStatus" type="textarea" /></el-form-item>
          <el-form-item label="身体情况"><el-input v-model="daily.bodyStatus" type="textarea" /></el-form-item>
          <el-form-item label="备注"><el-input v-model="daily.note" type="textarea" /></el-form-item>
          <el-button type="primary" :loading="saving" @click="submitDaily">保存日报</el-button>
        </el-form>
      </div>
      <div>
        <h2>客观事件</h2>
        <el-form label-position="top">
          <el-form-item label="分类"><el-select v-model="eventForm.category"><el-option label="客观" value="objective" /><el-option label="健康" value="health" /><el-option label="安全" value="safety" /><el-option label="其他" value="other" /></el-select></el-form-item>
          <el-form-item label="关联人员 personRef"><el-input v-model="eventForm.personRef" placeholder="可留空" /></el-form-item>
          <el-form-item label="内容"><el-input v-model="eventForm.content" type="textarea" /></el-form-item>
          <el-button type="primary" :loading="saving" @click="submitEvent">记录事件</el-button>
        </el-form>
      </div>
    </section>
  </main>
</template>

<style scoped>
.guide-session { padding: 24px; color: #1f2937; }
.toolbar { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.eyebrow { margin: 0 0 6px; color: #2563eb; font-weight: 700; }
h1, h2 { margin: 0 0 12px; }
.panel { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 18px; margin-bottom: 16px; }
.people-list { display: grid; gap: 10px; }
.person-row { display: flex; justify-content: space-between; gap: 16px; padding: 12px; border-radius: 12px; background: #f8fafc; }
.person-row p { margin: 4px 0 0; color: #64748b; }
.person-row.inactive { background: #fff7ed; }
.actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
@media (max-width: 780px) { .guide-session { padding: 14px; } .toolbar, .person-row { flex-direction: column; } .form-grid { grid-template-columns: 1fr; } }
</style>
