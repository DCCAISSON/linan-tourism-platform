<template>
  <section class="pretrip-page" aria-labelledby="school-pretrip-title">
    <header class="pretrip-heading">
      <p class="pretrip-heading__eyebrow">学校签认</p>
      <h2 id="school-pretrip-title">学校行前签认</h2>
      <p>学校账号只能在自身范围内签认当前车辆计划，也可以提交调整诉求；处理后旧签认会失效，需要重新签认。</p>
    </header>

    <form class="pretrip-card" @submit.prevent="sign">
      <label class="pretrip-field">团期
        <select v-model="tourSessionId" required>
          <option value="">请选择团期</option>
          <option v-for="session in sessions" :key="session.id" :value="session.id">{{ session.code }}</option>
        </select>
      </label>
      <div class="pretrip-actions"><button type="submit" :disabled="tourSessionId === '' || signing">确认当前行前安排</button></div>
      <p v-if="confirmation" class="pretrip-state">已签认：v{{ confirmation.planVersion }} / {{ confirmation.rosterVersion }} / {{ confirmation.status }}</p>
    </form>

    <form class="pretrip-card" @submit.prevent="submitAdjustment">
      <h3>提交调整诉求</h3>
      <div class="pretrip-grid">
        <label class="pretrip-field">类型<select v-model="kind"><option value="vehicle_change">车辆调整</option><option value="profile_correction">本人信息更正</option></select></label>
        <label class="pretrip-field">人员引用<input v-model="personRef" type="text" placeholder="paid:order-line-id，可留空"></label>
      </div>
      <label class="pretrip-field">诉求<textarea v-model="requestText" rows="4" required /></label>
      <div class="pretrip-actions"><button type="submit" :disabled="tourSessionId === '' || submitting">提交诉求</button></div>
      <p v-if="adjustment" class="pretrip-state">诉求已提交：{{ adjustment.id }} / {{ adjustment.status }}</p>
      <p v-if="message" class="pretrip-state" :class="{ 'pretrip-state--error': failed }">{{ message }}</p>
    </form>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue"
import { listTourSessions, type TourSession } from "@/api/configuration"
import { readablePretripError, signSchoolPretrip, submitPretripAdjustment, type PretripAdjustment, type SchoolPretripConfirmation } from "@/api/pretrip"
import "@/styles/pretrip.css"

const sessions = ref<readonly TourSession[]>([])
const tourSessionId = ref("")
const confirmation = ref<SchoolPretripConfirmation | null>(null)
const adjustment = ref<PretripAdjustment | null>(null)
const kind = ref<"vehicle_change" | "profile_correction">("vehicle_change")
const personRef = ref("")
const requestText = ref("")
const signing = ref(false)
const submitting = ref(false)
const message = ref("")
const failed = ref(false)

onMounted(async () => { sessions.value = await listTourSessions() })

async function sign(): Promise<void> {
  signing.value = true
  failed.value = false
  try {
    confirmation.value = await signSchoolPretrip(tourSessionId.value)
    message.value = "签认完成"
  } catch (error) {
    failed.value = true
    message.value = readablePretripError(error)
  } finally {
    signing.value = false
  }
}

async function submitAdjustment(): Promise<void> {
  submitting.value = true
  failed.value = false
  try {
    adjustment.value = await submitPretripAdjustment(tourSessionId.value, { kind: kind.value, personRef: personRef.value === "" ? null : personRef.value, requestText: requestText.value })
    message.value = "诉求已提交，等待处理后重新签认"
  } catch (error) {
    failed.value = true
    message.value = readablePretripError(error)
  } finally {
    submitting.value = false
  }
}
</script>
