import { randomUUID } from "node:crypto"
import process from "node:process"

const databaseUrl = process.env.DATABASE_URL
const username = process.env.STAFF_ADMIN_USERNAME
const displayName = process.env.STAFF_ADMIN_DISPLAY_NAME ?? "系统管理员"
const temporaryPassword = process.env.STAFF_ADMIN_TEMP_PASSWORD

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required")
}
if (!username || !temporaryPassword) {
  throw new Error("STAFF_ADMIN_USERNAME and STAFF_ADMIN_TEMP_PASSWORD are required")
}

const { createDomainDataSource } = await import("../dist/domain/data-source.js")
const { hashStaffPassword } = await import("../dist/modules/iam/staff-password.js")

const dataSource = createDomainDataSource(databaseUrl)
let bootstrapLockAcquired = false
const permissionKeys = [
  "workbench.read",
  "configuration.read",
  "configuration.write",
  "roster.read",
  "roster.import",
  "roster.correct",
  "roster.export",
  "roster.export_sensitive",
  "orders.read",
  "refunds.preview",
  "refunds.simulate",
  "refunds.manage",
  "refunds.review",
  "refunds.execute",
  "payments.reconcile",
  "pretrip.read",
  "pretrip.write",
  "pretrip.school_confirm",
  "notifications.read",
  "notifications.write",
  "notifications.send",
  "execution.read",
  "execution.write",
  "execution.manage",
  "execution.publish",
  "health.read",
  "health.manage",
  "evaluations.read",
  "evaluations.write",
  "evaluations.confirm",
  "evaluations.standard.write",
  "evaluations.standard.confirm",
  "evaluations.school_report",
  "feedback.read",
  "feedback.submit",
  "feedback.review",
  "insurance.read",
  "insurance.write",
  "insurance.export",
  "insurance.sensitive.export",
  "media.read",
  "media.upload",
  "media.publish",
  "media.delete",
  "crm.read",
  "crm.write",
  "crm.export",
  "crm.contact.read",
  "business.read",
  "business.write",
  "business.followup",
  "transport.read",
  "transport.write",
  "transport.export",
  "staff_accounts.manage",
  "audit.read",
  "sensitive_data.read",
]

try {
  await dataSource.initialize()
  const lockRows = await dataSource.query("select get_lock('linan_staff_admin_bootstrap', 10) as acquired")
  if (Number(lockRows[0]?.acquired ?? 0) !== 1) {
    throw new Error("could not acquire staff admin bootstrap lock")
  }
  bootstrapLockAcquired = true
  const accountId = `staff-${randomUUID()}`
  await dataSource.transaction(async (manager) => {
    const existing = await manager.query("select id from staff_accounts limit 1 for update")
    if (existing.length > 0) {
      throw new Error("staff admin bootstrap is only allowed when no staff account exists")
    }
    await manager.query(
      "insert into staff_accounts (id, username, display_name, password_hash, status, force_password_change, failed_login_attempts, permissions_version, created_at, updated_at) values (?, ?, ?, ?, 'active', true, 0, 1, current_timestamp(6), current_timestamp(6))",
      [accountId, username, displayName, await hashStaffPassword(temporaryPassword)],
    )
    for (const permissionKey of permissionKeys) {
      await manager.query(
        "insert into staff_account_permissions (id, staff_account_id, permission_key, created_at) values (?, ?, ?, current_timestamp(6))",
        [`perm-${randomUUID()}`, accountId, permissionKey],
      )
    }
    await manager.query(
      "insert into staff_account_scopes (id, staff_account_id, scope_kind, scope_id, created_at) values (?, ?, 'all', null, current_timestamp(6))",
      [`scope-${randomUUID()}`, accountId],
    )
  })
  console.log(JSON.stringify({ created: true, username }))
} finally {
  if (bootstrapLockAcquired) {
    await dataSource.query("select release_lock('linan_staff_admin_bootstrap')")
  }
  if (dataSource.isInitialized) {
    await dataSource.destroy()
  }
}
