<template>
  <main class="login-page">
    <section class="login-panel" aria-labelledby="login-title">
      <div class="login-copy">
        <p class="login-copy__eyebrow">临安文旅数字化平台</p>
        <h1 id="login-title">管理后台登录</h1>
        <p>使用管理员开设的工作人员账号登录。生产环境不再接受开发期模拟身份。</p>
      </div>

      <el-form class="login-form" label-position="top" @submit.prevent="submitLogin">
        <el-form-item label="账号">
          <el-input v-model="username" autocomplete="username" placeholder="请输入账号" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="password" autocomplete="current-password" placeholder="请输入密码" show-password type="password" />
        </el-form-item>
        <el-alert v-if="errorMessage.length > 0" class="login-form__alert" :closable="false" type="error" :title="errorMessage" />
        <el-button class="login-form__button" type="primary" :loading="submitting" @click="submitLogin">
          登录后台
        </el-button>
      </el-form>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref } from "vue"
import { useRoute, useRouter } from "vue-router"

import { getCurrentStaff, loginStaff } from "@/api/auth"
import { readableApiError } from "@/api/configuration"
import { firstAuthorizedRouteName } from "@/router/authorized-route"
import { routeNames } from "@/router/routes"

const route = useRoute()
const router = useRouter()
const username = ref("")
const password = ref("")
const errorMessage = ref("")
const submitting = ref(false)

async function submitLogin(): Promise<void> {
  if (submitting.value) {
    return
  }
  submitting.value = true
  errorMessage.value = ""
  try {
    const account = await loginStaff(username.value, password.value)
    if (account.forcePasswordChange) {
      await router.push({ name: routeNames.forcePasswordChange, query: { username: account.username } })
      return
    }
    const redirect = typeof route.query["redirect"] === "string" ? route.query["redirect"] : undefined
    if (redirect !== undefined) {
      await router.push(redirect)
      return
    }
    const staff = await getCurrentStaff()
    await router.push({ name: firstAuthorizedRouteName(staff.permissionKeys) ?? routeNames.login })
  } catch (error) {
    errorMessage.value = readableApiError(error)
  } finally {
    submitting.value = false
  }
}
</script>
