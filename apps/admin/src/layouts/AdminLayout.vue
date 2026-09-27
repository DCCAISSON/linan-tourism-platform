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
        <router-link v-if="hasPermission('workbench.read')" class="admin-nav__item" to="/home">工作台</router-link>
        <router-link v-if="hasPermission('configuration.read')" class="admin-nav__item" to="/configuration">活动配置</router-link>
        <router-link v-if="hasPermission('roster.read')" class="admin-nav__item" to="/roster">名单统计</router-link>
        <router-link v-if="hasPermission('roster.read')" class="admin-nav__item" to="/travelers">出行人员</router-link>
        <router-link v-if="hasPermission('orders.read')" class="admin-nav__item" to="/orders">订单管理</router-link>
        <router-link v-if="canOpenRefundApplications" class="admin-nav__item" to="/refund-applications">退款申请</router-link>
        <router-link v-if="hasPermission('payments.reconcile') && capabilities.paymentReconciliationEnabled" class="admin-nav__item" to="/payments/reconciliation">支付对账</router-link>
        <router-link v-if="hasPermission('transport.read')" class="admin-nav__item" to="/transport">车辆安排</router-link>
        <router-link v-if="hasPermission('pretrip.write')" class="admin-nav__item" to="/pretrip">行前配置</router-link>
        <router-link v-if="hasPermission('pretrip.school_confirm')" class="admin-nav__item" to="/school-confirmation">学校行前签认</router-link>
        <router-link v-if="hasPermission('notifications.read') && hasPermission('notifications.write') && hasPermission('notifications.send')" class="admin-nav__item" to="/notifications">通知管理</router-link>
        <router-link v-if="hasPermission('execution.read')" class="admin-nav__item" to="/execution">导游执行</router-link>
        <router-link v-if="hasPermission('health.read')" class="admin-nav__item" to="/health-access">健康授权</router-link>
        <router-link v-if="hasPermission('evaluations.read') || hasPermission('evaluations.school_report')" class="admin-nav__item" to="/evaluations">学生评价</router-link>
        <router-link v-if="hasPermission('evaluations.standard.write') || hasPermission('evaluations.standard.confirm')" class="admin-nav__item" to="/evaluation-standards">评价标准</router-link>
        <router-link v-if="hasPermission('feedback.read')" class="admin-nav__item" to="/feedback">服务反馈</router-link>
        <router-link v-if="hasPermission('insurance.read')" class="admin-nav__item" to="/insurance">保险工作台</router-link>
        <router-link v-if="hasPermission('media.read')" class="admin-nav__item" to="/media">影像管理</router-link>
        <router-link v-if="hasPermission('crm.read')" class="admin-nav__item" to="/crm">客户管理</router-link>
        <router-link v-if="hasPermission('business.read')" class="admin-nav__item" to="/business">商旅业务</router-link>
        <router-link v-if="hasPermission('staff_accounts.manage')" class="admin-nav__item" to="/staff-accounts">账号权限</router-link>
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
        <router-view />
      </main>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue"
import { useRouter } from "vue-router"

import { getCurrentStaff, logoutStaff, type StaffPermissionKey } from "@/api/auth"
import { enabledPlatformCapabilities, getCapabilities, type PlatformCapabilities } from "@/api/capabilities"
import { routeNames } from "@/router/routes"

const router = useRouter()
const permissionKeys = ref<readonly StaffPermissionKey[]>([])
const capabilities = ref<PlatformCapabilities>(enabledPlatformCapabilities)
const canOpenRefundApplications = ref(false)

onMounted(async () => {
  const [staff, platformCapabilities] = await Promise.all([getCurrentStaff(), getCapabilities()])
  permissionKeys.value = staff.permissionKeys
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
