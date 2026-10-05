<template>
  <section class="transport-page" aria-labelledby="transport-title">
    <header class="transport-heading">
      <div>
        <p class="transport-heading__eyebrow">车辆安排</p>
        <h2 id="transport-title">手工车辆分配与联系单导出</h2>
      </div>
      <p>按团期维护车辆、班级人数和联系人；导入名单与订单统计不会被改变。</p>
    </header>

    <form class="transport-filter" @submit.prevent="loadPlan">
      <fieldset :disabled="loadingOptions || loadingPlan || saving">
        <legend>选择范围</legend>
        <div class="field">
          <label for="transport-session">团期</label>
          <select id="transport-session" v-model="tourSessionId" required>
            <option value="">{{ loadingOptions ? "团期加载中..." : "请选择团期" }}</option>
            <option v-for="session in sessions" :key="session.id" :value="session.id">{{ session.code }}</option>
          </select>
        </div>
        <div class="field">
          <label for="transport-school">学校/机构</label>
          <select id="transport-school" v-model="schoolId" required>
            <option value="">请选择学校</option>
            <option v-for="school in schools" :key="school.id" :value="school.id">{{ school.name }}</option>
          </select>
        </div>
        <div class="field">
          <label for="transport-grade">年级</label>
          <select id="transport-grade" v-model="gradeId" :disabled="schoolId === '' || loadingGrades">
            <option value="">{{ schoolId === "" ? "请先选学校" : "请选择年级" }}</option>
            <option v-for="grade in grades" :key="grade.id" :value="grade.id">{{ grade.name }}</option>
          </select>
        </div>
        <div class="field">
          <label for="transport-class">班级</label>
          <select id="transport-class" v-model="classId" :disabled="gradeId === '' || loadingClasses">
            <option value="">{{ gradeId === "" ? "请先选年级" : "请选择班级" }}</option>
            <option v-for="schoolClass in classes" :key="schoolClass.id" :value="schoolClass.id">{{ schoolClass.name }}</option>
          </select>
        </div>
        <div class="transport-actions">
          <button type="submit" :disabled="tourSessionId === ''">{{ loadingPlan ? "读取中..." : "读取安排" }}</button>
          <button type="button" :disabled="!canWrite" @click="addVehicle">新增车辆</button>
          <button type="button" :disabled="saveDisabled" @click="submitPlan">{{ saving ? "保存中..." : "保存安排" }}</button>
          <button class="transport-button--secondary" type="button" :disabled="exportDisabled" @click="exportPlan">{{ exporting ? "导出中..." : "导出联系单" }}</button>
        </div>
      </fieldset>
      <p v-if="formError" class="transport-state transport-state--error" role="alert">{{ formError }}</p>
    </form>

    <section class="transport-card transport-document" aria-labelledby="transport-document-title">
      <h3 id="transport-document-title">联系单资料</h3>
      <p class="transport-state">随“保存安排”保存；未填写的项目在联系单留空。人数按班级安排汇总。</p>
      <fieldset class="transport-vehicle__grid" :disabled="!canWrite || loadingPlan || saving">
        <label>研学行程名称<input v-model="documentSnapshot.tripTitle" maxlength="200"></label>
        <label>出行日期<input v-model="documentSnapshot.tripDate" type="date"></label>
        <label>联系单学校<input v-model="documentSnapshot.schoolName" maxlength="200"></label>
        <label>联系单年级<input v-model="documentSnapshot.gradeName" maxlength="200"></label>
        <label>导游组长<input v-model="documentSnapshot.guideLeaderName" maxlength="120"></label>
        <label>导游组长电话<input v-model="documentSnapshot.guideLeaderPhone" maxlength="120"></label>
        <label>学校领队<input v-model="documentSnapshot.schoolLeaderName" maxlength="120"></label>
        <label>学校领队电话<input v-model="documentSnapshot.schoolLeaderPhone" maxlength="120"></label>
        <label>联系单集合时间<input v-model="documentSnapshot.gatheringTime" maxlength="120"></label>
        <label>出发时间<input v-model="documentSnapshot.departureTime" maxlength="120"></label>
        <label class="transport-document__wide">大巴停放要求<textarea v-model="documentSnapshot.parkingInstructions" rows="3" maxlength="2000" /></label>
        <label class="transport-document__wide">收费说明<textarea v-model="documentSnapshot.feeExplanation" rows="3" maxlength="2000" /></label>
        <label class="transport-document__wide">物料准备<textarea v-model="documentSnapshot.materialChecklist" rows="3" maxlength="2000" /></label>
      </fieldset>
    </section>

    <section class="transport-summary" aria-label="车辆汇总">
      <article><span>已安排人数</span><strong>{{ totals.occupancy }} 人</strong></article>
      <article><span>座位合计</span><strong>{{ totals.seatCapacity }} 座</strong></article>
      <article><span>学生/家长/教师/其他</span><strong>{{ totals.studentCount }}/{{ totals.guardianCount }}/{{ totals.teacherCount }}/{{ totals.otherCount }}</strong></article>
      <article><span>车辆计划版本</span><strong>v{{ planVersion }}</strong></article>
    </section>

    <section class="transport-card" aria-labelledby="transport-warning-title">
      <h3 id="transport-warning-title">容量提示</h3>
      <p v-if="warnings.length === 0" class="transport-state">暂无容量提示。</p>
      <ul v-else class="transport-warning-list">
        <li v-for="warning in warnings" :key="warning">{{ warning }}</li>
      </ul>
    </section>

    <section class="transport-card" aria-labelledby="transport-vehicles-title">
      <div class="transport-card__heading">
        <h3 id="transport-vehicles-title">车辆明细</h3>
        <span>{{ vehicles.length }} 辆车</span>
      </div>
      <p v-if="vehicles.length === 0" class="transport-state">请选择团期后新增车辆。</p>
      <article v-for="(vehicle, vehicleIndex) in vehicles" :key="vehicle.localId" class="transport-vehicle">
        <div class="transport-vehicle__grid">
          <label>车号<input v-model.number="vehicle.sequence" type="number" min="1"></label>
          <label>座位数<input v-model.number="vehicle.seatCapacity" type="number" min="1"></label>
          <label>车牌号码<input v-model="vehicle.plateNumber" type="text"></label>
          <label>驾驶员<input v-model="vehicle.contactSnapshot.driverName" type="text"></label>
          <label>电话<input v-model="vehicle.contactSnapshot.driverPhone" type="text"></label>
          <label>导游<input v-model="vehicle.contactSnapshot.guideName" type="text"></label>
          <label>电话<input v-model="vehicle.contactSnapshot.guidePhone" type="text"></label>
          <label>老师<input v-model="vehicle.contactSnapshot.teacherName" type="text"></label>
          <label>联系电话<input v-model="vehicle.contactSnapshot.teacherPhone" type="text"></label>
        </div>
        <div class="transport-allocation-actions">
          <strong>{{ vehicleOccupancy(vehicle) }}/{{ vehicle.seatCapacity }} 人</strong>
          <button type="button" @click="addAllocation(vehicle)">添加班级</button>
          <button class="transport-button--danger" type="button" @click="vehicles.splice(vehicleIndex, 1)">删除车辆</button>
        </div>
        <div class="transport-table-wrap">
          <table class="transport-table" aria-label="车辆班级安排表">
            <thead><tr><th>班级</th><th>学生</th><th>家长</th><th>教师</th><th>其他</th><th>备注</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="(allocation, allocationIndex) in vehicle.allocations" :key="allocation.localId">
                <td data-label="班级"><select v-model="allocation.classId"><option value="">请选择班级</option><option v-for="schoolClass in classes" :key="schoolClass.id" :value="schoolClass.id">{{ schoolClass.name }}</option></select></td>
                <td data-label="学生"><input v-model.number="allocation.studentCount" type="number" min="0"></td>
                <td data-label="家长"><input v-model.number="allocation.guardianCount" type="number" min="0"></td>
                <td data-label="教师"><input v-model.number="allocation.teacherCount" type="number" min="0"></td>
                <td data-label="其他"><input v-model.number="allocation.otherCount" type="number" min="0"></td>
                <td data-label="备注"><input v-model="allocation.note" type="text"></td>
                <td data-label="操作"><button type="button" @click="vehicle.allocations.splice(allocationIndex, 1)">删除</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </section>

    <section class="transport-card" aria-labelledby="transport-people-title">
      <div class="transport-card__heading">
        <div>
          <h3 id="transport-people-title">逐人分配与确认快照</h3>
          <p v-if="peoplePlan" class="transport-state">实际乘车人数与上方班级安排人数分列。</p>
          <p v-else class="transport-state">读取团期后显示可分配人员。</p>
        </div>
        <span v-if="peoplePlan?.confirmation" class="transport-confirmation-status">确认 {{ peoplePlan.confirmation.status === "current" ? "有效" : "已过期" }}</span>
      </div>

      <div v-if="peoplePlan" class="transport-people-grid">
        <article class="transport-people-panel">
          <h4>车辆实际占用</h4>
          <ul class="transport-warning-list">
            <li v-for="vehicle in peoplePlan.vehicles" :key="vehicle.id">
              {{ vehicle.sequence }}号车：实际 {{ vehicle.actualOccupancy }}/{{ vehicle.seatCapacity }}，班级估计 {{ vehicle.estimatedOccupancy }}
            </li>
          </ul>
        </article>
        <article class="transport-people-panel">
          <h4>方案确认</h4>
          <p v-if="peoplePlan.confirmation" class="transport-state">
            最近确认：{{ new Date(peoplePlan.confirmation.confirmedAt).toLocaleString('zh-CN', { hour12: false }) }}
          </p>
          <p v-else class="transport-state">当前车辆安排尚未确认。</p>
          <button type="button" :disabled="!canWrite || confirming" @click="confirmPeoplePlan">{{ confirming ? "确认中..." : "确认当前安排" }}</button>
          <button class="transport-button--secondary" type="button" :disabled="!canExport || peoplePlan.confirmation?.status !== 'current' || exportingPeople" @click="exportPeoplePlan">{{ exportingPeople ? "导出中..." : "导出最终逐人名单" }}</button>
          <p class="transport-state">仅导出有效确认名单；调整安排后须重新确认。名单不含证件、电话和健康资料。</p>
        </article>
      </div>

      <div v-if="peoplePlan" class="transport-people-grid">
        <article class="transport-people-panel">
          <h4>规则建议参数</h4>
          <label>每车预留位<input v-model.number="reservedSeats" type="number" min="0"></label>
          <label>每车教师/导游占位<input v-model.number="staffSeats" type="number" min="0"></label>
          <label class="transport-checkbox"><input v-model="keepFamilyTogether" type="checkbox">要求亲子同车</label>
          <label class="transport-checkbox"><input v-model="allowClassSplit" type="checkbox">允许拆班</label>
          <button type="button" :disabled="!canWrite || suggesting" @click="suggestPeoplePlan">{{ suggesting ? "生成中..." : "生成可调整草案" }}</button>
        </article>
        <article class="transport-people-panel">
          <h4>建议结果</h4>
          <p v-if="suggestion === null" class="transport-state">尚未生成建议。</p>
          <template v-else>
            <p class="transport-state">结果：{{ suggestion.kind === "draft" ? "可调整草案" : "存在冲突" }}</p>
            <ul class="transport-warning-list">
              <li v-for="message in [...suggestion.explanations, ...suggestion.conflicts]" :key="message">{{ message }}</li>
            </ul>
            <button type="button" :disabled="suggestion.kind !== 'draft'" @click="applySuggestion">应用草案到页面</button>
          </template>
        </article>
      </div>

      <div v-if="peoplePlan" class="transport-table-wrap">
        <table class="transport-table" aria-label="逐人车辆分配表">
          <thead><tr><th>人员</th><th>班级/角色</th><th>状态</th><th>车辆</th></tr></thead>
          <tbody>
            <tr v-for="person in peopleRows" :key="person.personRef">
              <td data-label="人员">{{ person.displayName }}</td>
              <td data-label="班级/角色">{{ person.className ?? person.importedRole ?? "未分班" }}</td>
              <td data-label="状态">{{ person.active ? "可分配" : "已失效" }}</td>
              <td data-label="车辆">
                <select v-model="peopleAssignments[person.personRef]" :disabled="!person.active">
                  <option value="">未分配</option>
                  <option v-for="vehicle in peoplePlan.vehicles" :key="vehicle.id" :value="vehicle.id">{{ vehicle.sequence }}号车</option>
                </select>
                <button v-if="!person.active && peopleAssignments[person.personRef]" type="button" :disabled="!canWrite" @click="peopleAssignments[person.personRef] = ''">移除失效分配</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="peoplePlan?.conflicts.length" class="transport-state transport-state--error">存在名单冲突，请先核对 travelers 后再确认车辆安排。</p>
      <div v-if="peoplePlan" class="transport-actions">
        <button type="button" :disabled="!canWrite || savingPeople" @click="savePeopleAssignments">{{ savingPeople ? "保存中..." : "保存逐人分配" }}</button>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { getCurrentStaff, type StaffScope } from "@/api/auth"
import { listClasses, listGrades, listSchools, listTourSessions } from "@/api/configuration"
import type { Grade, School, SchoolClass, TourSession } from "@/api/configuration"
import { pendingSessionNavigationKey, type PendingSessionNavigation } from "@/layouts/session-navigation"
import {
  confirmTransportPlan,
  downloadTransportPlan,
  downloadTransportPeoplePlan,
  getTransportPeoplePlan,
  getTransportPlan,
  readableTransportError,
  saveTransportAssignments,
  saveTransportPlan,
  suggestTransportAssignments,
} from "@/api/transport"
import type { PersonRef, TransportPeoplePlan, TransportPlan, TransportSuggestion } from "@/api/transport"
import "@/styles/transport.css"

type EditableAllocation = { localId: string; classId: string; studentCount: number; guardianCount: number; teacherCount: number; otherCount: number; note: string }
type EditableVehicle = { localId: string; sequence: number; seatCapacity: number; plateNumber: string; contactSnapshot: { driverName: string; driverPhone: string; guideName: string; guidePhone: string; teacherName: string; teacherPhone: string }; allocations: EditableAllocation[] }

const sessions = ref<readonly TourSession[]>([])
const route = useRoute()
const router = useRouter()
const pagePath = route.path
const scopes = ref<readonly StaffScope[]>([])
let optionsReady = false
let queryUpdates = 0
const pendingSession = inject(pendingSessionNavigationKey, ref<PendingSessionNavigation>())
let navigationToken: symbol | undefined
let sessionRevision = 0
const schools = ref<readonly School[]>([])
const grades = ref<readonly Grade[]>([])
const classes = ref<readonly SchoolClass[]>([])
const vehicles = ref<EditableVehicle[]>([])
const documentSnapshot = ref(emptyDocument())
const tourSessionId = ref("")
const schoolId = ref("")
const gradeId = ref("")
const classId = ref("")
const formError = ref("")
const loadingOptions = ref(false)
const loadingGrades = ref(false)
const loadingClasses = ref(false)
const loadingPlan = ref(false)
const saving = ref(false)
const exporting = ref(false)
const exportingPeople = ref(false)
const canWrite = ref(false)
const canExport = ref(false)
const serverWarnings = ref<readonly string[]>([])
const planVersion = ref(1)
const peoplePlan = ref<TransportPeoplePlan | null>(null)
const peopleAssignments = ref<Record<string, string>>({})
const savingPeople = ref(false)
const confirming = ref(false)
const suggesting = ref(false)
const reservedSeats = ref(0)
const staffSeats = ref(0)
const keepFamilyTogether = ref(false)
const allowClassSplit = ref(true)
const suggestion = ref<TransportSuggestion | null>(null)

const totals = computed(() => vehicles.value.reduce((total, vehicle) => ({
  studentCount: total.studentCount + sum(vehicle, "studentCount"),
  guardianCount: total.guardianCount + sum(vehicle, "guardianCount"),
  teacherCount: total.teacherCount + sum(vehicle, "teacherCount"),
  otherCount: total.otherCount + sum(vehicle, "otherCount"),
  occupancy: total.occupancy + vehicleOccupancy(vehicle),
  seatCapacity: total.seatCapacity + vehicle.seatCapacity,
}), { studentCount: 0, guardianCount: 0, teacherCount: 0, otherCount: 0, occupancy: 0, seatCapacity: 0 }))
const warnings = computed(() => [...serverWarnings.value, ...vehicles.value.flatMap(vehicleWarnings)])
const saveDisabled = computed(() => tourSessionId.value === "" || !canWrite.value || saving.value || loadingPlan.value)
const exportDisabled = computed(() => tourSessionId.value === "" || !canExport.value || exporting.value)
const peopleRows = computed(() => peoplePlan.value === null ? [] : [
  ...peoplePlan.value.assignments.map((assignment) => ({
    personRef: assignment.personRef,
    displayName: assignment.displayName,
    className: assignment.className,
    importedRole: assignment.importedRole,
    active: assignment.active,
  })),
  ...peoplePlan.value.unassigned,
])

watch(tourSessionId, () => {
  sessionRevision += 1
  const session = sessions.value.find((item) => item.id === tourSessionId.value)
  schoolId.value = session?.organizationId ?? ""
	  vehicles.value = []
  documentSnapshot.value = emptyDocument()
	  serverWarnings.value = []
  peoplePlan.value = null
  peopleAssignments.value = {}
  suggestion.value = null
  planVersion.value = 1
  loadingPlan.value = false; saving.value = false; savingPeople.value = false; confirming.value = false; suggesting.value = false
  formError.value = ""
  void writeSessionQuery()
}, { flush: "sync" })
watch(schoolId, async () => { gradeId.value = ""; classId.value = ""; classes.value = []; await loadGrades() })
watch(gradeId, async () => { classId.value = ""; await loadClasses() })

onMounted(async () => {
  try {
    await Promise.all([loadOptions(), loadPermissions()])
    optionsReady = true
    readSessionQuery()
  } catch (caught) { formError.value = readableTransportError(caught) }
})
onBeforeUnmount(() => {
  sessionRevision += 1
  if (pendingSession.value?.token === navigationToken) pendingSession.value = undefined
})
watch(() => route.query["tourSessionId"], readSessionQuery)

function readSessionQuery(): void {
  if (!optionsReady || route.path !== pagePath || queryUpdates > 0) return
  tourSessionId.value = permittedSession(route.query["tourSessionId"])?.id ?? ""
  void writeSessionQuery()
}
async function writeSessionQuery(): Promise<void> {
  if (!optionsReady || route.path !== pagePath) return
  const current = permittedSession(tourSessionId.value)?.id
  if (route.query["tourSessionId"] === current && pendingSession.value?.path !== pagePath) return
  const query = { ...route.query }
  if (current === undefined) delete query["tourSessionId"]
  else query["tourSessionId"] = current
  queryUpdates += 1
  const token = Symbol()
  navigationToken = token
  pendingSession.value = { path: pagePath, tourSessionId: current, token }
  try { await router.replace({ query }) }
  finally {
    queryUpdates -= 1
    if (pendingSession.value?.token === token) pendingSession.value = undefined
  }
}
function permittedSession(id: unknown): TourSession | undefined {
  const session = sessions.value.find(row => row.id === id)
  return session !== undefined && scopes.value.some(scope => scope.kind === "all"
    || (scope.kind === "tour_session" && scope.id === session.id)
    || ((scope.kind === "school" || scope.kind === "organization") && scope.id === session.organizationId)) ? session : undefined
}

async function loadOptions(): Promise<void> {
  loadingOptions.value = true
  try { [schools.value, sessions.value] = await Promise.all([listSchools(), listTourSessions()]) }
  catch (caught) { formError.value = readableTransportError(caught) }
  finally { loadingOptions.value = false }
}

async function loadPermissions(): Promise<void> {
  const staff = await getCurrentStaff()
  scopes.value = staff.scopes
  canWrite.value = staff.permissionKeys.includes("transport.write")
  canExport.value = staff.permissionKeys.includes("transport.export")
}

async function loadGrades(): Promise<void> {
  const requestedSchool = schoolId.value
  if (requestedSchool === "") { grades.value = []; loadingGrades.value = false; return }
  loadingGrades.value = true
  try { const rows = await listGrades(requestedSchool); if (requestedSchool === schoolId.value) grades.value = rows }
  catch (caught) { if (requestedSchool === schoolId.value) formError.value = readableTransportError(caught) }
  finally { if (requestedSchool === schoolId.value) loadingGrades.value = false }
}

async function loadClasses(): Promise<void> {
  const requestedGrade = gradeId.value
  if (requestedGrade === "") { classes.value = []; loadingClasses.value = false; return }
  loadingClasses.value = true
  try { const rows = await listClasses(requestedGrade); if (requestedGrade === gradeId.value) classes.value = rows }
  catch (caught) { if (requestedGrade === gradeId.value) formError.value = readableTransportError(caught) }
  finally { if (requestedGrade === gradeId.value) loadingClasses.value = false }
}

async function loadPlan(): Promise<void> {
  if (tourSessionId.value === "") return
  const requestRevision = sessionRevision
  loadingPlan.value = true
  formError.value = ""
	  try {
    const plan = await getTransportPlan(tourSessionId.value)
    if (requestRevision !== sessionRevision) return
    applyPlan(plan)
    await loadPeoplePlan()
  }
	  catch (caught) { if (requestRevision === sessionRevision) formError.value = readableTransportError(caught) }
  finally { if (requestRevision === sessionRevision) loadingPlan.value = false }
}

async function submitPlan(): Promise<void> {
  if (tourSessionId.value === "") return
  const requestRevision = sessionRevision
  saving.value = true
  formError.value = ""
	  try {
    const plan = await saveTransportPlan(tourSessionId.value, { vehicles: vehicles.value.map(toPayloadVehicle), documentSnapshot: documentSnapshot.value })
    if (requestRevision !== sessionRevision) return
    applyPlan(plan)
    await loadPeoplePlan()
  }
	  catch (caught) { if (requestRevision === sessionRevision) formError.value = readableTransportError(caught) }
  finally { if (requestRevision === sessionRevision) saving.value = false }
}

async function exportPlan(): Promise<void> {
  if (tourSessionId.value === "") return
  exporting.value = true
  try { await downloadTransportPlan(tourSessionId.value) }
  catch (caught) { formError.value = readableTransportError(caught) }
  finally { exporting.value = false }
}

async function exportPeoplePlan(): Promise<void> {
  if (tourSessionId.value === "") return
  exportingPeople.value = true
  formError.value = ""
  try { await downloadTransportPeoplePlan(tourSessionId.value) }
  catch (caught) { formError.value = readableTransportError(caught) }
  finally { exportingPeople.value = false }
}

function applyPlan(plan: TransportPlan): void {
  documentSnapshot.value = { ...(plan.documentSnapshot ?? emptyDocument()) }
  planVersion.value = plan.planVersion
  serverWarnings.value = plan.warnings
  vehicles.value = plan.vehicles.map((vehicle) => ({
    localId: vehicle.id ?? crypto.randomUUID(),
    sequence: vehicle.sequence,
    seatCapacity: vehicle.seatCapacity,
    plateNumber: vehicle.plateNumber,
    contactSnapshot: { ...vehicle.contactSnapshot },
    allocations: vehicle.allocations.map((allocation) => ({
      localId: allocation.id ?? crypto.randomUUID(),
      classId: allocation.classId,
      studentCount: allocation.studentCount,
      guardianCount: allocation.guardianCount,
      teacherCount: allocation.teacherCount,
      otherCount: allocation.otherCount,
      note: allocation.note,
    })),
  }))
}

async function loadPeoplePlan(): Promise<void> {
  if (tourSessionId.value === "") return
  const requestRevision = sessionRevision
  const nextPlan = await getTransportPeoplePlan(tourSessionId.value)
  if (requestRevision !== sessionRevision) return
  applyPeoplePlan(nextPlan)
}

async function savePeopleAssignments(): Promise<void> {
  if (tourSessionId.value === "" || peoplePlan.value === null) return
  const requestRevision = sessionRevision
  savingPeople.value = true
  formError.value = ""
  try {
    const plan = await saveTransportAssignments(tourSessionId.value, {
      expectedPlanVersion: peoplePlan.value.planVersion,
      expectedRosterVersion: peoplePlan.value.rosterVersion,
      assignments: Object.entries(peopleAssignments.value)
        .filter((entry) => entry[1] !== "")
        .flatMap((entry) => isPersonRef(entry[0]) ? [{ personRef: entry[0], vehicleId: entry[1] }] : []),
    })
    if (requestRevision === sessionRevision) applyPeoplePlan(plan)
  } catch (caught) { if (requestRevision === sessionRevision) formError.value = readableTransportError(caught) }
  finally { if (requestRevision === sessionRevision) savingPeople.value = false }
}

async function confirmPeoplePlan(): Promise<void> {
  if (tourSessionId.value === "" || peoplePlan.value === null) return
  const requestRevision = sessionRevision
  confirming.value = true
  formError.value = ""
  try {
    const plan = await confirmTransportPlan(tourSessionId.value, {
      expectedPlanVersion: peoplePlan.value.planVersion,
      expectedRosterVersion: peoplePlan.value.rosterVersion,
    })
    if (requestRevision === sessionRevision) applyPeoplePlan(plan)
  } catch (caught) { if (requestRevision === sessionRevision) formError.value = readableTransportError(caught) }
  finally { if (requestRevision === sessionRevision) confirming.value = false }
}

async function suggestPeoplePlan(): Promise<void> {
  if (tourSessionId.value === "" || peoplePlan.value === null) return
  const requestRevision = sessionRevision
  suggesting.value = true
  formError.value = ""
  try {
    const availableSeatsBySequence = sequenceMap((vehicle) => vehicle.seatCapacity)
    const reservedSeatsBySequence = sequenceMap(() => reservedSeats.value)
    const staffSeatsBySequence = sequenceMap(() => staffSeats.value)
    const result = await suggestTransportAssignments(tourSessionId.value, {
      availableSeatsBySequence,
      reservedSeatsBySequence,
      staffSeatsBySequence,
      keepFamilyTogether: keepFamilyTogether.value,
      allowClassSplit: allowClassSplit.value,
    })
    if (requestRevision === sessionRevision) suggestion.value = result
  } catch (caught) { if (requestRevision === sessionRevision) formError.value = readableTransportError(caught) }
  finally { if (requestRevision === sessionRevision) suggesting.value = false }
}

function applyPeoplePlan(plan: TransportPeoplePlan): void {
  peoplePlan.value = plan
  planVersion.value = plan.planVersion
  peopleAssignments.value = Object.fromEntries(plan.assignments.map((assignment) => [assignment.personRef, assignment.vehicleId]))
}

function applySuggestion(): void {
  if (peoplePlan.value === null || suggestion.value?.kind !== "draft") return
  const vehicleBySequence = new Map(peoplePlan.value.vehicles.map((vehicle) => [vehicle.sequence, vehicle.id]))
  peopleAssignments.value = {
    ...peopleAssignments.value,
    ...Object.fromEntries(suggestion.value.assignments.flatMap((assignment) => {
      const vehicleId = vehicleBySequence.get(assignment.sequence)
      return vehicleId === undefined ? [] : [[assignment.personRef, vehicleId]]
    })),
  }
}

function addVehicle(): void {
  vehicles.value.push({ localId: crypto.randomUUID(), sequence: nextSequence(), seatCapacity: 48, plateNumber: "", contactSnapshot: emptyContact(), allocations: [] })
}

function addAllocation(vehicle: EditableVehicle): void {
  vehicle.allocations.push({ localId: crypto.randomUUID(), classId: classId.value, studentCount: 0, guardianCount: 0, teacherCount: 0, otherCount: 0, note: "" })
}

function toPayloadVehicle(vehicle: EditableVehicle) {
  return { sequence: vehicle.sequence, seatCapacity: vehicle.seatCapacity, plateNumber: vehicle.plateNumber, contactSnapshot: vehicle.contactSnapshot, allocations: vehicle.allocations }
}

function sequenceMap(read: (vehicle: TransportPeoplePlan["vehicles"][number]) => number): Readonly<Record<number, number>> {
  if (peoplePlan.value === null) return {}
  return Object.fromEntries(peoplePlan.value.vehicles.map((vehicle) => [vehicle.sequence, read(vehicle)]))
}

function isPersonRef(value: string): value is PersonRef {
  return value.startsWith("paid:") || value.startsWith("imported:")
}

function vehicleOccupancy(vehicle: EditableVehicle): number {
  return sum(vehicle, "studentCount") + sum(vehicle, "guardianCount") + sum(vehicle, "teacherCount") + sum(vehicle, "otherCount")
}

function vehicleWarnings(vehicle: EditableVehicle): readonly string[] {
  const occupancy = vehicleOccupancy(vehicle)
  if (vehicle.seatCapacity > occupancy) return [`${vehicle.sequence}号车未满载：容量${vehicle.seatCapacity}人，已安排${occupancy}人`]
  if (vehicle.seatCapacity < occupancy) return [`${vehicle.sequence}号车超载：容量${vehicle.seatCapacity}人，已安排${occupancy}人`]
  return []
}

function sum(vehicle: EditableVehicle, key: "studentCount" | "guardianCount" | "teacherCount" | "otherCount"): number {
  return vehicle.allocations.reduce((value, allocation) => value + allocation[key], 0)
}

function nextSequence(): number {
  return vehicles.value.reduce((max, vehicle) => Math.max(max, vehicle.sequence), 0) + 1
}

function emptyContact() {
  return { driverName: "", driverPhone: "", guideName: "", guidePhone: "", teacherName: "", teacherPhone: "" }
}

function emptyDocument() {
  return { tripTitle: "", tripDate: "", schoolName: "", gradeName: "", guideLeaderName: "", guideLeaderPhone: "", schoolLeaderName: "", schoolLeaderPhone: "", parkingInstructions: "", gatheringTime: "", departureTime: "", feeExplanation: "", materialChecklist: "" }
}
</script>
