<template>
  <section class="session-workspace" aria-label="团期工作空间">
    <p class="session-workspace__eyebrow">团期工作空间</p>
    <p v-if="loading" role="status">正在读取团期…</p>
    <p v-else-if="error" role="alert">{{ error }} <button type="button" @click="loadOptions">重试</button></p>
    <template v-else-if="selected">
      <h2>{{ schoolName }} · {{ activityTitle }}</h2>
      <p>{{ date(selected.startsAt) }} 至 {{ date(selected.endsAt) }} · {{ selected.code }}</p>
      <nav ref="moduleNavigation" class="session-workspace__modules" aria-label="本团期模块">
        <router-link v-for="item in availableLinks" :key="item.to" :to="{ path: item.to, query: { tourSessionId: selected.id } }">{{ item.label }}</router-link>
      </nav>
      <p v-if="moduleError" class="session-workspace__muted">部分模块入口暂时无法读取。<button type="button" @click="loadOptions">重试</button></p>
      <details v-if="canReadStatus" class="session-workspace__status">
        <summary>本团行前准备</summary>
        <button type="button" :disabled="statusLoading" @click="loadStatus">{{ statusLoading ? '读取中…' : '读取最新状态' }}</button>
        <p v-if="!statusRows.length && !statusLoading" class="session-workspace__muted">按最新记录核对行前信息、学校签认、保险与通知。</p>
        <ul v-if="statusRows.length"><li v-for="row in statusRows" :key="row.label"><span>{{ row.label }}</span><strong>{{ row.text }}</strong></li></ul>
      </details>
    </template>
    <p v-else>请在下方选择有权查看的团期，再继续办理本团事务。</p>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useRoute } from "vue-router"
import type { StaffPermissionKey, StaffScope } from "@/api/auth"
import { listCatalogItems, listSchools, listTourSessions, type CatalogItem, type School, type TourSession } from "@/api/configuration"
import { listEvaluationSessions } from "@/api/evaluations"
import { listExecutionManagementSessions } from "@/api/execution"
import { getLatestInsuranceBatch } from "@/api/insurance"
import { getNotificationSession, getNotificationSessions } from "@/api/notifications"
import { getPretripConfig, listSchoolConfirmations } from "@/api/pretrip"
import { listArchiveSessions } from "@/api/session-archives"

const props = defineProps<{
  readonly sessionId: string | undefined
  readonly links: readonly { readonly to: string; readonly label: string }[]
  readonly permissions: readonly StaffPermissionKey[]
  readonly scopes: readonly StaffScope[]
}>()
const sessions = ref<readonly TourSession[]>([])
const route = useRoute()
const moduleNavigation = ref<HTMLElement>()
let navigationResize: ResizeObserver | undefined
const schools = ref<readonly School[]>([])
const activities = ref<readonly CatalogItem[]>([])
const permittedModules = ref<Readonly<Record<string, readonly string[]>>>({})
const loading = ref(false)
const error = ref("")
const moduleError = ref(false)
const statusLoading = ref(false)
const statusRows = ref<readonly { readonly label: string; readonly text: string }[]>([])
let statusRevision = 0
let optionsRevision = 0
const selected = computed(() => sessions.value.find(row => row.id === props.sessionId && props.scopes.some(scope => scope.kind === "all" || scope.kind === "tour_session" && scope.id === row.id || (scope.kind === "school" || scope.kind === "organization") && scope.id === row.organizationId)))
const schoolName = computed(() => schools.value.find(row => row.id === selected.value?.organizationId)?.name ?? "学校名称暂缺")
const activityTitle = computed(() => activities.value.find(row => row.id === selected.value?.catalogItemId)?.title ?? "活动名称暂缺")
const scopedModules = ["/notifications", "/execution/management", "/evaluations", "/session-archives"]
const availableLinks = computed(() => props.links.filter(item => !scopedModules.includes(item.to) || permittedModules.value[item.to]?.includes(props.sessionId ?? "")))
const has = (permission: StaffPermissionKey): boolean => props.permissions.includes(permission)
const canReadStatus = computed(() => has("pretrip.write") || has("insurance.read") || availableLinks.value.some(item => item.to === "/notifications"))

async function loadOptions(): Promise<void> {
  const request = ++optionsRevision
  loading.value = true; error.value = ""; moduleError.value = false
  try {
    const [sessionRows, schoolRows, activityRows] = await Promise.all([listTourSessions(), listSchools(), listCatalogItems()])
    if (request !== optionsRevision) return
    sessions.value = sessionRows; schools.value = schoolRows; activities.value = activityRows
    const readers = [
      { path: "/notifications", read: getNotificationSessions },
      { path: "/execution/management", read: listExecutionManagementSessions },
      { path: "/evaluations", read: listEvaluationSessions },
      { path: "/session-archives", read: listArchiveSessions },
    ].filter(item => props.links.some(link => link.to === item.path))
    const results = await Promise.allSettled(readers.map(async item => [item.path, (await item.read()).map(row => row.id)] as const))
    if (request !== optionsRevision) return
    permittedModules.value = Object.fromEntries(results.flatMap(result => result.status === "fulfilled" ? [result.value] : []))
    moduleError.value = results.some(result => result.status === "rejected")
  } catch (cause) { if (request === optionsRevision) error.value = cause instanceof Error ? "团期暂时无法读取，请重试。" : String(cause) }
  finally { if (request === optionsRevision) loading.value = false }
}
async function loadStatus(): Promise<void> {
  const id = selected.value?.id
  if (!id || statusLoading.value) return
  const request = ++statusRevision
  statusLoading.value = true; statusRows.value = []
  const readers: { readonly label: string; readonly read: () => Promise<string> }[] = []
  if (has("pretrip.write")) {
    readers.push({ label: "行前信息", read: async () => (await getPretripConfig(id)).version === 0 ? "待配置" : "已保存" })
    readers.push({ label: "学校签认", read: async () => {
      const rows = await listSchoolConfirmations(id)
      return rows.some(row => row.status === "current") ? "当前安排已签认" : rows.some(row => row.status === "stale") ? "安排已变化，需重新签认" : "缺少有效签认"
    } })
  }
  if (has("insurance.read")) readers.push({ label: "保险交接", read: async () => {
    const batch = await getLatestInsuranceBatch(id)
    return batch === null ? "尚未建立批次" : ({ draft: "批次待送交", blocked: "资料问题待处理", submitted: "已送交，待保险结果", insured: "最新批次已承保", failed: "保险失败待核实", change_pending: "变更交接待跟进" } as const)[batch.status]
  } })
  if (availableLinks.value.some(item => item.to === "/notifications")) readers.push({ label: "团期通知", read: async () => {
    const { tasks } = await getNotificationSession(id)
    const retry = tasks.filter(row => row.status === "retryable_failed").length
    const manual = tasks.filter(row => row.status === "manual_required").length
    return `${retry} 项待重试 · ${manual} 项待人工核实`
  } })
  const rows = await Promise.all(readers.map(async item => {
    try { return { label: item.label, text: await item.read() } }
    catch (cause) { if (cause instanceof Error) return { label: item.label, text: "暂时无法读取" }; throw cause }
  }))
  if (request !== statusRevision) return
  statusRows.value = rows; statusLoading.value = false
}
function date(value: string): string { return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) }
watch(() => props.sessionId, () => { statusRevision += 1; statusRows.value = []; statusLoading.value = false })
function keepActiveModuleVisible(): void {
  const navigation = moduleNavigation.value
  const active = navigation?.querySelector<HTMLElement>(".router-link-exact-active")
  if (!navigation || !active) return
  const parent = navigation.getBoundingClientRect()
  const item = active.getBoundingClientRect()
  if (item.left < parent.left) navigation.scrollLeft += item.left - parent.left
  else if (item.right > parent.right) navigation.scrollLeft += item.right - parent.right
}
watch([availableLinks, loading, () => route.path], async () => { await nextTick(); keepActiveModuleVisible() })
watch(moduleNavigation, navigation => {
  navigationResize?.disconnect()
  if (navigation) {
    navigationResize = new ResizeObserver(keepActiveModuleVisible)
    navigationResize.observe(navigation)
    for (const link of navigation.children) navigationResize.observe(link)
  }
}, { flush: "post" })
onMounted(loadOptions)
onBeforeUnmount(() => { optionsRevision += 1; statusRevision += 1; navigationResize?.disconnect() })
</script>

<style scoped>
.session-workspace { display: grid; gap: var(--space-3); min-width: 0; margin-bottom: var(--space-6); padding: var(--space-5); border-radius: var(--radius-card); background: var(--surface-elevated); }
h2, p { margin: 0; overflow-wrap: anywhere; }
h2 { font-size: var(--font-h3); line-height: 1.4; text-wrap: balance; }
p, li, a, button, summary { font-size: var(--font-body-sm); line-height: 1.5; }
p { color: var(--text-secondary); }
.session-workspace__eyebrow { color: var(--accent-primary); font-weight: 600; }
.session-workspace__modules { display: flex; gap: var(--space-2); max-width: 100%; min-width: 0; overflow-x: auto; }
.session-workspace__modules a { flex: 0 0 auto; white-space: nowrap; }
a, button, summary { min-height: var(--size-touch-target); }
a, button { display: inline-flex; align-items: center; padding: var(--space-2) var(--space-3); color: var(--accent-primary); background: var(--surface-secondary); border: 0; border-radius: var(--radius-control); font: inherit; }
a:hover, button:hover { background: var(--accent-soft); }
a.router-link-exact-active { background: var(--accent-primary); color: var(--on-accent); }
a:focus-visible, button:focus-visible, summary:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: var(--space-1); }
button, summary { cursor: pointer; }
button:disabled { cursor: wait; opacity: .6; }
summary { padding: var(--space-3) 0; color: var(--text-primary); }
.session-workspace__status > button { margin-bottom: var(--space-3); }
ul { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
li { display: flex; justify-content: space-between; flex-wrap: wrap; gap: var(--space-2); padding: var(--space-2) 0; border-top: 1px solid var(--border-subtle); }
li span { color: var(--text-secondary); }
li strong { font-weight: 500; }
</style>
