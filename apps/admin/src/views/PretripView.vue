<template>
  <section class="pretrip-page" aria-labelledby="pretrip-title">
    <header class="pretrip-heading">
      <p class="pretrip-heading__eyebrow">行前服务</p>
      <h2 id="pretrip-title">行前配置</h2>
      <p>维护团期集合信息、行程提示、联系人和附件索引；告知同意版本只引用，不覆盖历史记录。</p>
    </header>

    <form class="pretrip-card" @submit.prevent="loadConfig">
      <div class="pretrip-grid">
        <label class="pretrip-field">团期
          <select v-model="tourSessionId" required>
            <option value="">请选择团期</option>
            <option v-for="session in sessions" :key="session.id" :value="session.id">{{ session.code }}</option>
          </select>
        </label>
        <label class="pretrip-field">集合时间<input v-model="draft.gatheringAt" type="datetime-local"></label>
        <label class="pretrip-field">集合地点<input v-model="draft.gatheringPlace" type="text" @input="clearGatheringCoordinates"></label>
        <label class="pretrip-field">集合纬度（GCJ-02）<input v-model="draft.gatheringLatitude" type="text" inputmode="decimal" placeholder="-90 至 90" aria-describedby="coordinates-help"></label>
        <label class="pretrip-field">集合经度（GCJ-02）<input v-model="draft.gatheringLongitude" type="text" inputmode="decimal" placeholder="-180 至 180" aria-describedby="coordinates-help"></label>
        <label class="pretrip-field">出行方式
          <select v-model="draft.travelMode"><option value="group">统一集合</option><option value="self">自行前往</option><option value="mixed">混合出行</option></select>
        </label>
        <label class="pretrip-field">联系人<input v-model="draft.contactName" type="text"></label>
        <label class="pretrip-field">联系电话<input v-model="draft.contactPhone" type="text"></label>
        <label class="pretrip-field">客服入口<input v-model="draft.serviceContact" type="text"></label>
        <label class="pretrip-field">告知书版本ID<input v-model="draft.noticeVersionId" type="text"></label>
      </div>
      <p id="coordinates-help" class="pretrip-state">请填写 GCJ-02 坐标。纬度、经度须同时填写或同时清空；未填写时仅向家长展示集合地址。</p>
      <label class="pretrip-field">行程须知<textarea v-model="draft.itineraryNote" rows="4" /></label>
      <div class="pretrip-actions">
        <button type="submit" :disabled="tourSessionId === '' || loading">读取配置</button>
        <button type="button" :disabled="tourSessionId === '' || saving" @click="saveConfig">保存配置</button>
      </div>
      <p v-if="message" class="pretrip-state" :class="{ 'pretrip-state--error': failed }">{{ message }}</p>
    </form>

    <section class="pretrip-card" aria-labelledby="pretrip-attachments-title">
      <h3 id="pretrip-attachments-title">附件</h3>
      <p class="pretrip-state">后台只保存附件索引；家庭端下载时仍按订单归属授权并生成短期 URL。</p>
      <ul class="pretrip-list">
        <li v-for="attachment in attachments" :key="attachment.id">{{ attachment.title }} · {{ attachment.contentType }} · {{ attachment.byteSize }} bytes</li>
      </ul>
    </section>

    <section class="pretrip-card" aria-labelledby="pretrip-confirmations-title">
      <h3 id="pretrip-confirmations-title">学校签认状态</h3>
      <div class="pretrip-table-scroll">
        <table class="pretrip-table">
          <thead><tr><th>学校</th><th>计划版本</th><th>名单版本</th><th>状态</th><th>签认时间</th></tr></thead>
          <tbody><tr v-for="item in confirmations" :key="item.id"><td>{{ item.schoolId }}</td><td>v{{ item.planVersion }}</td><td>{{ item.rosterVersion }}</td><td>{{ item.status }}</td><td>{{ item.signedAt }}</td></tr></tbody>
        </table>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue"
import { listTourSessions, type TourSession } from "@/api/configuration"
import { getPretripConfig, listSchoolConfirmations, readablePretripError, savePretripConfig, type PretripAttachment, type PretripTravelMode, type SchoolPretripConfirmation } from "@/api/pretrip"
import "@/styles/pretrip.css"

const sessions = ref<readonly TourSession[]>([])
const tourSessionId = ref("")
const attachments = ref<readonly PretripAttachment[]>([])
const confirmations = ref<readonly SchoolPretripConfirmation[]>([])
const loading = ref(false)
const saving = ref(false)
const message = ref("")
const failed = ref(false)
const version = ref(0)
const draft = reactive<{ gatheringAt: string; gatheringPlace: string; gatheringLatitude: string; gatheringLongitude: string; travelMode: PretripTravelMode; itineraryNote: string; contactName: string; contactPhone: string; serviceContact: string; noticeVersionId: string }>({ gatheringAt: "", gatheringPlace: "", gatheringLatitude: "", gatheringLongitude: "", travelMode: "group", itineraryNote: "", contactName: "", contactPhone: "", serviceContact: "", noticeVersionId: "" })

onMounted(async () => { sessions.value = await listTourSessions() })

function clearGatheringCoordinates(): void {
  draft.gatheringLatitude = ""
  draft.gatheringLongitude = ""
  failed.value = false
  message.value = "集合地址已修改，请重新填写对应坐标；留空则仅展示地址"
}

async function loadConfig(): Promise<void> {
  loading.value = true
  failed.value = false
  try {
    const config = await getPretripConfig(tourSessionId.value)
    version.value = config.version
    draft.gatheringAt = config.gatheringAt === null ? "" : config.gatheringAt.slice(0, 16)
    draft.gatheringPlace = config.gatheringPlace
    draft.gatheringLatitude = config.gatheringLatitude === null ? "" : String(config.gatheringLatitude)
    draft.gatheringLongitude = config.gatheringLongitude === null ? "" : String(config.gatheringLongitude)
    draft.travelMode = config.travelMode
    draft.itineraryNote = config.itineraryNote
    draft.contactName = config.contactName
    draft.contactPhone = config.contactPhone
    draft.serviceContact = config.serviceContact
    draft.noticeVersionId = config.noticeVersionId ?? ""
    attachments.value = config.attachments
    confirmations.value = await listSchoolConfirmations(tourSessionId.value)
    message.value = "配置已读取"
  } catch (error) {
    failed.value = true
    message.value = readablePretripError(error)
  } finally {
    loading.value = false
  }
}

async function saveConfig(): Promise<void> {
  const latitudeText = draft.gatheringLatitude.trim()
  const longitudeText = draft.gatheringLongitude.trim()
  const gatheringLatitude = latitudeText === "" ? null : Number(latitudeText)
  const gatheringLongitude = longitudeText === "" ? null : Number(longitudeText)
  if ((gatheringLatitude === null) !== (gatheringLongitude === null) || (gatheringLatitude !== null && (!Number.isFinite(gatheringLatitude) || Math.abs(gatheringLatitude) > 90)) || (gatheringLongitude !== null && (!Number.isFinite(gatheringLongitude) || Math.abs(gatheringLongitude) > 180))) {
    failed.value = true
    message.value = "请同时填写有效纬度（-90 至 90）和经度（-180 至 180），或同时清空"
    return
  }
  saving.value = true
  failed.value = false
  try {
    const saved = await savePretripConfig(tourSessionId.value, {
      gatheringAt: draft.gatheringAt === "" ? null : new Date(draft.gatheringAt).toISOString(),
      gatheringPlace: draft.gatheringPlace,
      gatheringLatitude,
      gatheringLongitude,
      travelMode: draft.travelMode,
      itineraryNote: draft.itineraryNote,
      contactName: draft.contactName,
      contactPhone: draft.contactPhone,
      serviceContact: draft.serviceContact,
      noticeVersionId: draft.noticeVersionId === "" ? null : draft.noticeVersionId,
      expectedVersion: version.value,
      attachments: [],
    })
    version.value = saved.version
    attachments.value = saved.attachments
    message.value = "配置已保存"
  } catch (error) {
    failed.value = true
    message.value = readablePretripError(error)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.pretrip-table-scroll { width: 100%; min-width: 0; max-width: 100%; overflow-x: auto; }
</style>
