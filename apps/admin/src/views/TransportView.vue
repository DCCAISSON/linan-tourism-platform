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

    <section class="transport-summary" aria-label="车辆汇总">
      <article><span>已安排人数</span><strong>{{ totals.occupancy }} 人</strong></article>
      <article><span>座位合计</span><strong>{{ totals.seatCapacity }} 座</strong></article>
      <article><span>学生/家长/教师/其他</span><strong>{{ totals.studentCount }}/{{ totals.guardianCount }}/{{ totals.teacherCount }}/{{ totals.otherCount }}</strong></article>
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
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import { getCurrentStaff } from "@/api/auth"
import { listClasses, listGrades, listSchools, listTourSessions } from "@/api/configuration"
import type { Grade, School, SchoolClass, TourSession } from "@/api/configuration"
import { downloadTransportPlan, getTransportPlan, readableTransportError, saveTransportPlan } from "@/api/transport"
import type { TransportPlan } from "@/api/transport"
import "@/styles/transport.css"

type EditableAllocation = { localId: string; classId: string; studentCount: number; guardianCount: number; teacherCount: number; otherCount: number; note: string }
type EditableVehicle = { localId: string; sequence: number; seatCapacity: number; plateNumber: string; contactSnapshot: { driverName: string; driverPhone: string; guideName: string; guidePhone: string; teacherName: string; teacherPhone: string }; allocations: EditableAllocation[] }

const sessions = ref<readonly TourSession[]>([])
const schools = ref<readonly School[]>([])
const grades = ref<readonly Grade[]>([])
const classes = ref<readonly SchoolClass[]>([])
const vehicles = ref<EditableVehicle[]>([])
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
const canWrite = ref(false)
const canExport = ref(false)
const serverWarnings = ref<readonly string[]>([])

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

watch(tourSessionId, () => {
  const session = sessions.value.find((item) => item.id === tourSessionId.value)
  schoolId.value = session?.organizationId ?? ""
  vehicles.value = []
  serverWarnings.value = []
})
watch(schoolId, async () => { gradeId.value = ""; classId.value = ""; classes.value = []; await loadGrades() })
watch(gradeId, async () => { classId.value = ""; await loadClasses() })

onMounted(async () => {
  await Promise.all([loadOptions(), loadPermissions()])
})

async function loadOptions(): Promise<void> {
  loadingOptions.value = true
  try { [schools.value, sessions.value] = await Promise.all([listSchools(), listTourSessions()]) }
  catch (caught) { formError.value = readableTransportError(caught) }
  finally { loadingOptions.value = false }
}

async function loadPermissions(): Promise<void> {
  const staff = await getCurrentStaff()
  canWrite.value = staff.permissionKeys.includes("transport.write")
  canExport.value = staff.permissionKeys.includes("transport.export")
}

async function loadGrades(): Promise<void> {
  if (schoolId.value === "") return
  loadingGrades.value = true
  try { grades.value = await listGrades(schoolId.value) }
  catch (caught) { formError.value = readableTransportError(caught) }
  finally { loadingGrades.value = false }
}

async function loadClasses(): Promise<void> {
  if (gradeId.value === "") return
  loadingClasses.value = true
  try { classes.value = await listClasses(gradeId.value) }
  catch (caught) { formError.value = readableTransportError(caught) }
  finally { loadingClasses.value = false }
}

async function loadPlan(): Promise<void> {
  if (tourSessionId.value === "") return
  loadingPlan.value = true
  formError.value = ""
  try { applyPlan(await getTransportPlan(tourSessionId.value)) }
  catch (caught) { formError.value = readableTransportError(caught) }
  finally { loadingPlan.value = false }
}

async function submitPlan(): Promise<void> {
  if (tourSessionId.value === "") return
  saving.value = true
  formError.value = ""
  try { applyPlan(await saveTransportPlan(tourSessionId.value, { vehicles: vehicles.value.map(toPayloadVehicle) })) }
  catch (caught) { formError.value = readableTransportError(caught) }
  finally { saving.value = false }
}

async function exportPlan(): Promise<void> {
  if (tourSessionId.value === "") return
  exporting.value = true
  try { await downloadTransportPlan(tourSessionId.value) }
  catch (caught) { formError.value = readableTransportError(caught) }
  finally { exporting.value = false }
}

function applyPlan(plan: TransportPlan): void {
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

function addVehicle(): void {
  vehicles.value.push({ localId: crypto.randomUUID(), sequence: nextSequence(), seatCapacity: 48, plateNumber: "", contactSnapshot: emptyContact(), allocations: [] })
}

function addAllocation(vehicle: EditableVehicle): void {
  vehicle.allocations.push({ localId: crypto.randomUUID(), classId: classId.value, studentCount: 0, guardianCount: 0, teacherCount: 0, otherCount: 0, note: "" })
}

function toPayloadVehicle(vehicle: EditableVehicle) {
  return { sequence: vehicle.sequence, seatCapacity: vehicle.seatCapacity, plateNumber: vehicle.plateNumber, contactSnapshot: vehicle.contactSnapshot, allocations: vehicle.allocations }
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
</script>
