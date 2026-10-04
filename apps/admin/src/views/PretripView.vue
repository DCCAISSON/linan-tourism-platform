<template>
  <section class="pretrip-page" aria-labelledby="pretrip-title">
    <header class="pretrip-heading">
      <p class="pretrip-heading__eyebrow">行前服务</p>
      <h2 id="pretrip-title">行前配置</h2>
      <p>维护团期集合信息、行程提示、联系人和行前附件；告知同意版本只引用，不覆盖历史记录。</p>
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
        <button type="button" :disabled="tourSessionId === '' || saving || uploading" @click="saveConfig">保存配置</button>
      </div>
      <p v-if="message" class="pretrip-state" :class="{ 'pretrip-state--error': failed }">{{ message }}</p>
    </form>

    <section class="pretrip-card" aria-labelledby="pretrip-attachments-title">
      <h3 id="pretrip-attachments-title">附件</h3>
      <p class="pretrip-state">支持PDF、PNG、JPEG、WebP及Word文件，每个不超过10MB。先保存行前配置，再上传附件；上传成功后，本团家长即可查看。</p>
      <form class="pretrip-actions" @submit.prevent="uploadAttachment">
        <label class="pretrip-field">选择附件<input :key="tourSessionId" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" :disabled="uploading || saving || loadedSessionId !== tourSessionId || version === 0" @change="chooseAttachment"></label>
        <button type="submit" :disabled="selectedFile === null || uploading || saving || loadedSessionId !== tourSessionId || version === 0">{{ uploading ? '正在上传…' : '上传附件' }}</button>
      </form>
      <p v-if="attachmentMessage" class="pretrip-state" :class="{ 'pretrip-state--error': attachmentFailed }" role="status">{{ attachmentMessage }}</p>
      <ul class="pretrip-list">
        <li v-for="attachment in attachments" :key="attachment.id">{{ attachment.title }} · {{ Math.ceil(attachment.byteSize / 1024) }} KB</li>
      </ul>
      <p v-if="attachments.length === 0" class="pretrip-state">{{ loadedSessionId === tourSessionId ? '暂无附件' : '请先读取所选团期的配置' }}</p>
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
import { onMounted, reactive, ref, watch } from "vue"
import { listTourSessions, type TourSession } from "@/api/configuration"
import { getPretripConfig, listSchoolConfirmations, readablePretripError, savePretripConfig, uploadPretripAttachment, type PretripAttachment, type PretripTravelMode, type SchoolPretripConfirmation } from "@/api/pretrip"
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
const loadedSessionId = ref("")
const selectedFile = ref<File | null>(null)
const uploading = ref(false)
const attachmentMessage = ref("")
const attachmentFailed = ref(false)
const draft = reactive<{ gatheringAt: string; gatheringPlace: string; gatheringLatitude: string; gatheringLongitude: string; travelMode: PretripTravelMode; itineraryNote: string; contactName: string; contactPhone: string; serviceContact: string; noticeVersionId: string }>({ gatheringAt: "", gatheringPlace: "", gatheringLatitude: "", gatheringLongitude: "", travelMode: "group", itineraryNote: "", contactName: "", contactPhone: "", serviceContact: "", noticeVersionId: "" })

onMounted(async () => { sessions.value = await listTourSessions() })
watch(tourSessionId, () => { attachments.value = []; selectedFile.value = null; loadedSessionId.value = ""; attachmentMessage.value = "" })

function chooseAttachment(event: Event): void {
  selectedFile.value = event.target instanceof HTMLInputElement ? event.target.files?.[0] ?? null : null
  attachmentMessage.value = ""
}

async function uploadAttachment(): Promise<void> {
  const file = selectedFile.value
  const sessionId = tourSessionId.value
  if (file === null || sessionId !== loadedSessionId.value || version.value === 0) return
  attachmentFailed.value = false
  if (file.size === 0 || file.size > 10 * 1024 * 1024) { attachmentFailed.value = true; attachmentMessage.value = "请选择不超过10MB的文件"; return }
  uploading.value = true
  try {
    const saved = await uploadPretripAttachment(sessionId, file, version.value)
    if (sessionId !== tourSessionId.value) return
    attachments.value = saved.attachments
    version.value = saved.version
    selectedFile.value = null
    attachmentMessage.value = "附件已上传，家长可在行前信息中查看"
  } catch (error) {
    if (sessionId !== tourSessionId.value) return
    attachmentFailed.value = true
    attachmentMessage.value = readablePretripError(error)
  } finally { uploading.value = false }
}

function clearGatheringCoordinates(): void {
  draft.gatheringLatitude = ""
  draft.gatheringLongitude = ""
  failed.value = false
  message.value = "集合地址已修改，请重新填写对应坐标；留空则仅展示地址"
}

async function loadConfig(): Promise<void> {
  const sessionId = tourSessionId.value
  loading.value = true
  failed.value = false
  try {
    const config = await getPretripConfig(sessionId)
    if (sessionId !== tourSessionId.value) return
    loadedSessionId.value = sessionId
    version.value = config.version
    draft.gatheringAt = config.gatheringAt === null ? "" : new Date(new Date(config.gatheringAt).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16)
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
      gatheringAt: draft.gatheringAt === "" ? null : new Date(`${draft.gatheringAt}+08:00`).toISOString(),
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
    })
    version.value = saved.version
    loadedSessionId.value = saved.tourSessionId
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
