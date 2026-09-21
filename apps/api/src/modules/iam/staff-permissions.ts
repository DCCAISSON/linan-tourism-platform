export const STAFF_PERMISSION_KEYS = [
  "workbench.read",
  "configuration.read",
  "configuration.write",
  "roster.read",
  "roster.import",
  "roster.export",
  "roster.export_sensitive",
  "orders.read",
  "refunds.preview",
  "refunds.simulate",
  "transport.read",
  "transport.write",
  "transport.export",
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
