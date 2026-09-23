export const STAFF_PERMISSION_KEYS = [
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
  "pretrip.read",
  "pretrip.write",
  "pretrip.school_confirm",
  "notifications.read",
  "notifications.write",
  "notifications.send",
  "staff_accounts.manage",
  "audit.read",
  "sensitive_data.read",
] as const

export type StaffPermissionKey = (typeof STAFF_PERMISSION_KEYS)[number]

export const STAFF_SCOPE_KINDS = ["all", "organization", "school", "class", "tour_session"] as const

export type StaffScopeKind = (typeof STAFF_SCOPE_KINDS)[number]

export type StaffScope = {
  readonly kind: StaffScopeKind
  readonly id: string | null
}

export function isStaffPermissionKey(value: string): value is StaffPermissionKey {
  return STAFF_PERMISSION_KEYS.includes(value as StaffPermissionKey)
}

export function isStaffScopeKind(value: string): value is StaffScopeKind {
  return STAFF_SCOPE_KINDS.includes(value as StaffScopeKind)
}
