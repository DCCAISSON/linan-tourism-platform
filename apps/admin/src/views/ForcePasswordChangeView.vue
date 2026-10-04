<template>
  <main class="login-page">
    <section class="login-panel" aria-labelledby="password-title">
      <div class="login-copy">
        <p class="login-copy__eyebrow">首次登录</p>
        <h1 id="password-title">请先修改临时密码</h1>
        <p>管理员重置或新建账号后，需要先设置<span class="cjk-nowrap">自己的</span>正式密码。</p>
      </div>

      <el-form class="login-form" label-position="top" @submit.prevent="submitChange">
        <el-form-item label="账号">
          <el-input v-model="username" autocomplete="username" placeholder="请输入账号" />
        </el-form-item>
        <el-form-item label="当前临时密码">
          <el-input v-model="currentPassword" autocomplete="current-password" placeholder="请输入当前密码" show-password type="password" />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="newPassword" autocomplete="new-password" placeholder="至少12位，包含字母和数字" show-password type="password" />
        </el-form-item>
        <el-alert v-if="errorMessage.length > 0" class="login-form__alert" :closable="false" type="error" :title="errorMessage" />
        <el-button class="login-form__button" type="primary" :loading="submitting" @click="submitChange">
          修改并进入后台
        </el-button>
      </el-form>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref } from "vue"
import { useRoute, useRouter } from "vue-router"

import { changeStaffPassword, loginStaff } from "@/api/auth"
import { readableApiError } from "@/api/configuration"
import { routeNames } from "@/router/routes"

const route = useRoute()
const router = useRouter()
const username = ref(typeof route.query["username"] === "string" ? route.query["username"] : "")
const currentPassword = ref("")
const newPassword = ref("")
const errorMessage = ref("")
const submitting = ref(false)

async function submitChange(): Promise<void> {
  if (submitting.value) {
    return
  }
  submitting.value = true
  errorMessage.value = ""
  try {
    await changeStaffPassword(username.value, currentPassword.value, newPassword.value)
    await loginStaff(username.value, newPassword.value)
    await router.push({ name: routeNames.home })
  } catch (error) {
    errorMessage.value = readableApiError(error)
  } finally {
    submitting.value = false
  }
}
</script>
