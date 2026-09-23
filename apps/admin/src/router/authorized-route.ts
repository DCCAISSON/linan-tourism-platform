import type { StaffPermissionKey } from "@/api/auth"
import { routeNames } from "./routes"

type PermissionMeta = {
  readonly requiredPermission?: unknown
  readonly requiredAnyPermission?: unknown
}

const authorizedRouteOrder: readonly { readonly permissionKey: StaffPermissionKey; readonly routeName: string }[] = [
  { permissionKey: "workbench.read", routeName: routeNames.home },
  { permissionKey: "configuration.read", routeName: routeNames.configuration },
  { permissionKey: "roster.read", routeName: routeNames.roster },
  { permissionKey: "orders.read", routeName: routeNames.orders },
  { permissionKey: "refunds.review", routeName: routeNames.refundApplications },
  { permissionKey: "refunds.execute", routeName: routeNames.refundApplications },
  { permissionKey: "payments.reconcile", routeName: routeNames.paymentReconciliation },
  { permissionKey: "transport.read", routeName: routeNames.transport },
  { permissionKey: "pretrip.write", routeName: routeNames.pretrip },
  { permissionKey: "pretrip.school_confirm", routeName: routeNames.schoolConfirmation },
  { permissionKey: "notifications.read", routeName: routeNames.notifications },
  { permissionKey: "execution.read", routeName: routeNames.execution },
  { permissionKey: "health.read", routeName: routeNames.healthAccess },
  { permissionKey: "evaluations.read", routeName: routeNames.evaluations },
  { permissionKey: "evaluations.standard.write", routeName: routeNames.evaluationStandards },
  { permissionKey: "feedback.read", routeName: routeNames.feedback },
  { permissionKey: "insurance.read", routeName: routeNames.insurance },
  { permissionKey: "media.read", routeName: routeNames.media },
  { permissionKey: "crm.read", routeName: routeNames.crm },
  { permissionKey: "business.read", routeName: routeNames.business },
  { permissionKey: "staff_accounts.manage", routeName: routeNames.staffAccounts },
]

export function firstAuthorizedRouteName(permissionKeys: readonly StaffPermissionKey[]): string | null {
  return authorizedRouteOrder.find((route) => permissionKeys.includes(route.permissionKey))?.routeName ?? null
}

export function hasRoutePermission(permissionKeys: readonly StaffPermissionKey[], meta: PermissionMeta): boolean {
  const requiredPermission = readPermission(meta.requiredPermission)
  if (requiredPermission !== null && !permissionKeys.includes(requiredPermission)) {
    return false
  }
  const requiredAnyPermission = readPermissionList(meta.requiredAnyPermission)
  return requiredAnyPermission === null || requiredAnyPermission.some((permissionKey) => permissionKeys.includes(permissionKey))
}

function readPermission(value: unknown): StaffPermissionKey | null {
  return typeof value === "string" ? (value as StaffPermissionKey) : null
}

function readPermissionList(value: unknown): readonly StaffPermissionKey[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  return value.filter((item): item is StaffPermissionKey => typeof item === "string")
}
