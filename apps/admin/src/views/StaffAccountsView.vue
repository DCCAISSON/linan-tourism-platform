<template>
  <section class="staff-page">
    <header class="staff-page__header">
      <div>
        <p class="home-panel__eyebrow">工作人员账号</p>
        <h2>账号权限</h2>
      </div>
      <el-button v-if="canManageStaffAccounts" data-testid="staff-new-account" type="primary" @click="drawerOpen = true">新建账号</el-button>
    </header>

    <el-alert v-if="errorMessage.length > 0" :closable="false" type="error" :title="errorMessage" />

    <div class="staff-page__table">
      <el-table :data="accounts" border>
        <el-table-column prop="username" label="账号" min-width="160" />
        <el-table-column prop="displayName" label="姓名" min-width="140" />
        <el-table-column label="状态" width="120">
          <template #default="{ row }: { row: StaffAccount }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'">{{ row.status === "active" ? "启用" : "停用" }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="权限" min-width="260">
          <template #default="{ row }: { row: StaffAccount }">
            {{ permissionSummary(row) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220">
          <template #default="{ row }: { row: StaffAccount }">
            <el-button v-if="canManageStaffAccounts" size="small" @click="startReset(row)">重置密码</el-button>
            <el-button v-if="canManageStaffAccounts" size="small" type="danger" :disabled="row.status !== 'active'" @click="disableAccount(row)">停用</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="staff-page__cards" aria-label="工作人员账号列表">
      <article v-for="account in accounts" :key="account.id" class="staff-account-card" data-testid="staff-mobile-card">
        <div class="staff-account-card__header">
          <div>
            <strong>{{ account.username }}</strong>
            <span>{{ account.displayName }}</span>
          </div>
          <el-tag :type="account.status === 'active' ? 'success' : 'info'">{{ account.status === "active" ? "启用" : "停用" }}</el-tag>
        </div>
        <dl class="staff-account-card__facts">
          <div>
            <dt>权限</dt>
            <dd>{{ permissionSummary(account) }}</dd>
          </div>
        </dl>
        <div v-if="canManageStaffAccounts" class="staff-account-card__actions">
          <el-button data-testid="staff-mobile-reset" size="small" :aria-label="`重置密码 ${account.username}`" @click="startReset(account)">重置密码</el-button>
          <el-button data-testid="staff-mobile-disable" size="small" type="danger" :disabled="account.status !== 'active'" :aria-label="`停用 ${account.username}`" @click="disableAccount(account)">停用</el-button>
        </div>
      </article>
    </div>

    <el-drawer v-model="drawerOpen" title="新建工作人员账号" size="min(420px, 92vw)">
      <el-form data-testid="staff-account-form" label-position="top">
        <el-form-item label="账号">
          <el-input v-model="form.username" />
        </el-form-item>
        <el-form-item label="姓名">
          <el-input v-model="form.displayName" />
        </el-form-item>
        <el-form-item label="临时密码">
          <el-input v-model="form.temporaryPassword" show-password type="password" />
        </el-form-item>
        <el-form-item label="权限">
          <el-select v-model="form.permissionKeys" multiple filterable>
            <el-option v-for="key in permissionOptions" :key="key" :label="permissionLabel(key)" :value="key" />
          </el-select>
        </el-form-item>
        <el-form-item label="数据范围">
          <el-select v-model="form.scopeKind">
            <el-option label="全部" value="all" />
            <el-option label="机构" value="organization" />
            <el-option label="学校/机构" value="school" />
            <el-option label="班级" value="class" />
            <el-option label="团期" value="tour_session" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.scopeKind !== 'all'" label="范围 ID">
          <el-input v-model="form.scopeId" />
        </el-form-item>
        <el-button type="primary" :loading="saving" @click="createAccount">保存账号</el-button>
      </el-form>
    </el-drawer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue"

import {
  createStaffAccount,
  disableStaffAccount,
  getCurrentStaff,
  listStaffAccounts,
  resetStaffPassword,
  staffPermissionKeys,
  type StaffAccount,
  type StaffPermissionKey,
  type StaffScope,
} from "@/api/auth"
import { enabledPlatformCapabilities, getCapabilities, type PlatformCapabilities } from "@/api/capabilities"
import { readableApiError } from "@/api/configuration"

const financePermissionKeys = new Set<StaffPermissionKey>(["refunds.preview", "refunds.simulate", "refunds.manage", "refunds.execute", "payments.reconcile"])
const permissionOptions = computed(() => staffPermissionKeys.filter(isPermissionAvailable))

const accounts = ref<readonly StaffAccount[]>([])
const drawerOpen = ref(false)
const saving = ref(false)
const errorMessage = ref("")
const canManageStaffAccounts = ref(false)
const capabilities = ref<PlatformCapabilities>(enabledPlatformCapabilities)
const form = reactive({
  username: "",
  displayName: "",
  temporaryPassword: "",
  permissionKeys: ["workbench.read"] as StaffPermissionKey[],
  scopeKind: "all" as StaffScope["kind"],
  scopeId: "",
})

onMounted(async () => {
  const [staff, platformCapabilities] = await Promise.all([getCurrentStaff(), getCapabilities()])
  capabilities.value = platformCapabilities
  canManageStaffAccounts.value = staff.permissionKeys.includes("staff_accounts.manage")
  form.permissionKeys = form.permissionKeys.filter(isPermissionAvailable)
  await loadAccounts()
})

async function loadAccounts(): Promise<void> {
  try {
    accounts.value = await listStaffAccounts()
  } catch (error) {
    errorMessage.value = readableApiError(error)
  }
}

async function createAccount(): Promise<void> {
  saving.value = true
  errorMessage.value = ""
  try {
    await createStaffAccount({
      username: form.username,
      displayName: form.displayName,
      temporaryPassword: form.temporaryPassword,
      permissionKeys: form.permissionKeys.filter(isPermissionAvailable),
      scopes: [{ kind: form.scopeKind, id: form.scopeKind === "all" ? null : form.scopeId }],
    })
    drawerOpen.value = false
    await loadAccounts()
  } catch (error) {
    errorMessage.value = readableApiError(error)
  } finally {
    saving.value = false
  }
}

async function startReset(account: StaffAccount): Promise<void> {
  const temporaryPassword = window.prompt(`请输入 ${account.username} 的新临时密码`)
  if (temporaryPassword === null || temporaryPassword.length === 0) {
    return
  }
  await resetStaffPassword(account.id, temporaryPassword)
  await loadAccounts()
}

async function disableAccount(account: StaffAccount): Promise<void> {
  await disableStaffAccount(account.id)
  await loadAccounts()
}

function permissionSummary(account: StaffAccount): string {
  return account.permissionKeys.filter(isPermissionAvailable).map(permissionLabel).join("、")
}

function isPermissionAvailable(permissionKey: StaffPermissionKey): boolean {
  if (!financePermissionKeys.has(permissionKey)) {
    return true
  }
  if (permissionKey === "payments.reconcile") {
    return capabilities.value.paymentReconciliationEnabled
  }
  return capabilities.value.wechatRefundEnabled
}

function permissionLabel(permissionKey: StaffPermissionKey): string {
  return permissionLabels[permissionKey]
}

const permissionLabels: Record<StaffPermissionKey, string> = {
  "workbench.read": "查看工作台",
  "configuration.read": "查看活动配置",
  "configuration.write": "维护活动配置",
  "roster.read": "查看名单",
  "roster.import": "导入名单",
  "roster.correct": "更正名单",
  "roster.export": "导出名单",
  "roster.export_sensitive": "导出敏感名单",
  "orders.read": "查看订单",
  "refunds.preview": "退款试算",
  "refunds.simulate": "退款核验",
  "refunds.manage": "退款管理",
  "refunds.review": "退款申请审核",
  "refunds.execute": "退款执行",
  "payments.reconcile": "支付对账",
  "execution.read": "查看导游执行",
  "execution.write": "填写导游执行",
  "execution.manage": "管理导游执行",
  "execution.publish": "发布导游执行",
  "health.read": "查看健康授权",
  "health.manage": "管理健康授权",
  "evaluations.read": "查看学生评价",
  "evaluations.write": "填写学生评价",
  "evaluations.confirm": "确认学生评价",
  "evaluations.standard.write": "维护评价标准",
  "evaluations.standard.confirm": "确认评价标准",
  "evaluations.school_report": "查看学校报告",
  "feedback.read": "查看服务反馈",
  "feedback.submit": "提交服务反馈",
  "feedback.review": "审核服务反馈",
  "insurance.read": "查看保险",
  "insurance.write": "维护保险",
  "insurance.export": "导出保险名单",
  "insurance.sensitive.export": "导出保险敏感信息",
  "media.read": "查看影像",
  "media.upload": "上传影像",
  "media.publish": "发布影像",
  "media.delete": "删除影像",
  "crm.read": "查看客户",
  "crm.write": "维护客户",
  "crm.export": "导出客户",
  "crm.contact.read": "查看客户联系方式",
  "business.read": "查看商旅业务",
  "business.write": "维护商旅业务",
  "business.followup": "维护跟进记录",
  "transport.read": "查看车辆安排",
  "transport.write": "维护车辆安排",
  "transport.export": "导出车辆安排",
  "pretrip.read": "查看行前服务",
  "pretrip.write": "维护行前服务",
  "pretrip.school_confirm": "学校行前确认",
  "notifications.read": "查看通知",
  "notifications.write": "编辑通知",
  "notifications.send": "发送通知",
  "staff_accounts.manage": "管理员工账号",
  "audit.read": "查看审计",
  "sensitive_data.read": "查看敏感数据",
}
</script>
