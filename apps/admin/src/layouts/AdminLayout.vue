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
        <router-link v-if="hasPermission('orders.read')" class="admin-nav__item" to="/orders">订单管理</router-link>
        <router-link v-if="hasPermission('transport.read')" class="admin-nav__item" to="/transport">车辆安排</router-link>
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
import { routeNames } from "@/router/routes"

const router = useRouter()
const permissionKeys = ref<readonly StaffPermissionKey[]>([])

onMounted(async () => {
  const staff = await getCurrentStaff()
  permissionKeys.value = staff.permissionKeys
})

async function logout(): Promise<void> {
  await logoutStaff()
  await router.push({ name: routeNames.login })
}

function hasPermission(permissionKey: StaffPermissionKey): boolean {
  return permissionKeys.value.includes(permissionKey)
}
</script>
