<template>
  <div class="admin-shell">
    <aside class="admin-sidebar" aria-label="后台导航">
      <div class="admin-brand">
        <span class="admin-brand__mark" aria-hidden="true">临</span>
        <div>
          <p class="admin-brand__title">临安文旅</p>
          <p class="admin-brand__subtitle">管理后台</p>
        </div>
      </div>

      <nav class="admin-nav" aria-label="主要菜单">
        <details v-for="group in navigationGroups" :key="group.label" class="admin-nav__group" :open="!collapsedGroups.includes(group.label)" @toggle="toggleGroup(group.label, $event)">
          <summary class="admin-nav__heading">{{ group.label }}</summary>
          <div class="admin-nav__links">
            <router-link v-for="item in group.items" :key="item.to" class="admin-nav__item" :to="navigationTarget(item.to)">{{ item.label }}</router-link>
          </div>
        </details>
      </nav>
    </aside>

    <section class="admin-main">
      <header class="admin-header">
        <div>
          <p class="admin-header__eyebrow">PC 管理后台</p>
          <h1>研学出行服务台</h1>
        </div>
        <button class="admin-header__link" type="button" @click="logout">退出登录</button>
      </header>

      <main class="admin-content">
        <SessionWorkspace v-if="sessionPaths.includes(route.path) && permissionKeys.length" :session-id="currentSessionId" :links="workspaceLinks" :permissions="permissionKeys" :scopes="scopes" />
        <router-view />
      </main>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, provide, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"

import { getCurrentStaff, logoutStaff, type StaffPermissionKey, type StaffScope } from "@/api/auth"
import { enabledPlatformCapabilities, getCapabilities, type PlatformCapabilities } from "@/api/capabilities"
import { routeNames } from "@/router/routes"
import { pendingSessionNavigationKey, type PendingSessionNavigation } from "./session-navigation"
import SessionWorkspace from "./SessionWorkspace.vue"

const router = useRouter()
const route = useRoute()
const permissionKeys = ref<readonly StaffPermissionKey[]>([])
const scopes = ref<readonly StaffScope[]>([])
const capabilities = ref<PlatformCapabilities>(enabledPlatformCapabilities)
const canOpenRefundApplications = ref(false)
const collapsedGroups = ref<string[]>(["今日工作", "研学运营", "出团执行", "客户服务", "系统管理"])
const sessionPaths = ["/roster", "/travelers", "/transport", "/pretrip", "/insurance", "/notifications", "/execution/management", "/evaluations", "/session-archives"]
const pendingSession = ref<PendingSessionNavigation>()
provide(pendingSessionNavigationKey, pendingSession)
const currentSessionId = computed(() => {
  const id = pendingSession.value?.path === route.path ? pendingSession.value.tourSessionId : route.query["tourSessionId"]
  return typeof id === "string" ? id : undefined
})
function navigationTarget(path: string) {
  const tourSessionId = pendingSession.value?.path === route.path ? pendingSession.value.tourSessionId : route.query["tourSessionId"]
  return sessionPaths.includes(route.path) && sessionPaths.includes(path) && typeof tourSessionId === "string"
    ? { path, query: { tourSessionId } }
    : { path }
}
const navigationGroups = computed(() => [
  { label: "今日工作", items: [
    { to: "/home", label: "工作台", visible: hasPermission("workbench.read") },
  ] },
  { label: "研学运营", items: [
    { to: "/configuration", label: "活动配置", visible: hasPermission("configuration.read") },
    { to: "/contracts", label: "团期合同", visible: hasPermission("configuration.read") },
    { to: "/roster", label: "名单统计", visible: hasPermission("roster.read") },
    { to: "/travelers", label: "出行人员", visible: hasPermission("roster.read") },
    { to: "/orders", label: "订单管理", visible: hasPermission("orders.read") },
    { to: "/order-changes", label: "人员变更申请", visible: hasPermission("orders.read") },
    { to: "/refund-applications", label: "退款申请", visible: canOpenRefundApplications.value },
    { to: "/payments/reconciliation", label: "支付对账", visible: hasPermission("payments.reconcile") && capabilities.value.paymentReconciliationEnabled },
    { to: "/transport", label: "车辆安排", visible: hasPermission("transport.read") },
    { to: "/pretrip", label: "行前配置", visible: hasPermission("pretrip.write") },
    { to: "/school-confirmation", label: "学校行前签认", visible: hasPermission("pretrip.school_confirm") },
  ] },
  { label: "出团执行", items: [
    { to: "/execution", label: "导游执行", visible: hasPermission("execution.read") },
    { to: "/execution/management", label: "执行管理", visible: hasPermission("execution.read") && hasPermission("execution.manage") },
    { to: "/health-access", label: "健康授权", visible: hasPermission("health.read") },
    { to: "/evaluations", label: "学生评价", visible: hasPermission("evaluations.read") || hasPermission("evaluations.school_report") },
    { to: "/insurance", label: "保险工作台", visible: hasPermission("insurance.read") },
    { to: "/media", label: "影像管理", visible: hasPermission("media.read") },
    { to: "/session-archives", label: "团期归档", visible: hasPermission("orders.read") || hasPermission("roster.export") || hasPermission("transport.export") || hasPermission("execution.manage") || hasPermission("evaluations.school_report") },
  ] },
  { label: "客户服务", items: [
    { to: "/notifications", label: "通知管理", visible: hasPermission("notifications.read") && hasPermission("notifications.write") && hasPermission("notifications.send") },
    { to: "/feedback", label: "服务反馈", visible: hasPermission("feedback.read") || hasPermission("feedback.submit") },
    { to: "/crm", label: "客户管理", visible: hasPermission("crm.read") },
    { to: "/business", label: "商旅业务", visible: hasPermission("business.read") || hasPermission("business.write") || hasPermission("business.followup") },
  ] },
  { label: "系统管理", items: [
    { to: "/evaluation-standards", label: "评价标准", visible: hasPermission("evaluations.standard.write") || hasPermission("evaluations.standard.confirm") },
    { to: "/staff-accounts", label: "账号权限", visible: hasPermission("staff_accounts.manage") },
  ] },
].map(group => ({ ...group, items: group.items.filter(item => item.visible) })).filter(group => group.items.length > 0))
const workspaceLinks = computed(() => navigationGroups.value.flatMap(group => group.items).filter(item => sessionPaths.includes(item.to)))

watch([() => route.path, navigationGroups], () => {
  const activeGroup = navigationGroups.value.find(group => group.items.some(item => route.path === item.to || route.path.startsWith(`${item.to}/`)))
  if (activeGroup) collapsedGroups.value = collapsedGroups.value.filter(label => label !== activeGroup.label)
})

function toggleGroup(label: string, event: Event): void {
  if (event.currentTarget instanceof HTMLDetailsElement) {
    collapsedGroups.value = event.currentTarget.open
      ? collapsedGroups.value.filter(value => value !== label)
      : [...collapsedGroups.value.filter(value => value !== label), label]
  }
}

onMounted(async () => {
  const [staff, platformCapabilities] = await Promise.all([getCurrentStaff(), getCapabilities()])
  permissionKeys.value = staff.permissionKeys
  scopes.value = staff.scopes
  capabilities.value = platformCapabilities
  canOpenRefundApplications.value = hasPermission("refunds.review") || (hasPermission("refunds.execute") && platformCapabilities.wechatRefundEnabled)
})

async function logout(): Promise<void> {
  await logoutStaff()
  await router.push({ name: routeNames.login })
}

function hasPermission(permissionKey: StaffPermissionKey): boolean {
  return permissionKeys.value.includes(permissionKey)
}
</script>

<style scoped>
.admin-nav__heading {
  min-height: var(--size-touch-target);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-control);
  color: var(--text-primary);
  font-size: var(--font-body-sm);
  font-weight: 600;
  line-height: 1.5;
  cursor: pointer;
}

.admin-nav__heading:hover {
  background: var(--surface-elevated);
}

.admin-nav__heading:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: var(--space-1);
}

.admin-nav__links {
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-1);
  margin-left: var(--space-2);
}
</style>
