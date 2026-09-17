<template>
  <main class="login-page">
    <section class="login-panel" aria-labelledby="login-title">
      <div class="login-copy">
        <p class="login-copy__eyebrow">临安文旅数字化平台</p>
        <h1 id="login-title">管理后台登录</h1>
        <p>
          正式账号认证接入后开放登录。当前可进入本地演示，查看活动配置、工作台和名单。
        </p>
      </div>

      <el-form class="login-form" label-position="top">
        <el-form-item label="账号">
          <el-input disabled placeholder="等待正式认证服务" />
        </el-form-item>
        <el-form-item label="认证方式">
          <el-input disabled placeholder="等待角色会话接入" />
        </el-form-item>
        <el-button class="login-form__button" type="primary" @click="enterShell">
          进入本地演示
        </el-button>
      </el-form>
    </section>
  </main>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router"

import { routeNames } from "@/router/routes"

const router = useRouter()

async function enterShell(): Promise<void> {
  await router.push({ name: routeNames.home })
}
</script>
