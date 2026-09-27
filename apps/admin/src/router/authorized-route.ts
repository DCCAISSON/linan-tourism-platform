import type { StaffPermissionKey } from "@/api/auth"
import type { PlatformCapabilities, PlatformCapabilityKey } from "@/api/capabilities"
import { enabledPlatformCapabilities } from "@/api/capabilities"
import { routeNames } from "./routes"

type PermissionMeta = {
  readonly requiredPermission?: unknown
  readonly requiredAnyPermission?: unknown
  readonly requiredCapability?: unknown
  readonly permissionCapabilities?: unknown
}

type PermissionCapability = {
  readonly permissionKey: StaffPermissionKey
  readonly capabilityKey: PlatformCapabilityKey
}

const authorizedRouteOrder: readonly { readonly permissionKey: StaffPermissionKey; readonly routeName: string; readonly capabilityKey?: PlatformCapabilityKey }[] = [
  { permissionKey: "workbench.read", routeName: routeNames.home },
  { permissionKey: "configuration.read", routeName: routeNames.configuration },
  { permissionKey: "roster.read", routeName: routeNames.roster },
  { permissionKey: "orders.read", routeName: routeNames.orders },
  { permissionKey: "refunds.review", routeName: routeNames.refundApplications },
  { permissionKey: "refunds.execute", routeName: routeNames.refundApplications, capabilityKey: "wechatRefundEnabled" },
  { permissionKey: "payments.reconcile", routeName: routeNames.paymentReconciliation, capabilityKey: "paymentReconciliationEnabled" },
  { permissionKey: "transport.read", routeName: routeNames.transport },
  { permissionKey: "pretrip.write", routeName: routeNames.pretrip },
  { permissionKey: "pretrip.school_confirm", routeName: routeNames.schoolConfirmation },
  { permissionKey: "notifications.read", routeName: routeNames.notifications },
  { permissionKey: "execution.read", routeName: routeNames.execution },
  { permissionKey: "health.read", routeName: routeNames.healthAccess },
  { permissionKey: "evaluations.read", routeName: routeNames.evaluations },
  { permissionKey: "evaluations.school_report", routeName: routeNames.evaluations },
  { permissionKey: "evaluations.standard.write", routeName: routeNames.evaluationStandards },
  { permissionKey: "evaluations.standard.confirm", routeName: routeNames.evaluationStandards },
  { permissionKey: "feedback.read", routeName: routeNames.feedback },
  { permissionKey: "insurance.read", routeName: routeNames.insurance },
  { permissionKey: "media.read", routeName: routeNames.media },
  { permissionKey: "crm.read", routeName: routeNames.crm },
  { permissionKey: "business.read", routeName: routeNames.business },
  { permissionKey: "business.write", routeName: routeNames.business },
  { permissionKey: "business.followup", routeName: routeNames.business },
  { permissionKey: "staff_accounts.manage", routeName: routeNames.staffAccounts },
  { permissionKey: "roster.export", routeName: routeNames.sessionArchives },
  { permissionKey: "transport.export", routeName: routeNames.sessionArchives },
  { permissionKey: "execution.manage", routeName: routeNames.sessionArchives },
]

export function firstAuthorizedRouteName(permissionKeys: readonly StaffPermissionKey[], capabilities: PlatformCapabilities = enabledPlatformCapabilities): string | null {
  const routeName = authorizedRouteOrder.find((route) => permissionKeys.includes(route.permissionKey) && (route.capabilityKey === undefined || capabilities[route.capabilityKey]))?.routeName ?? null
  return routeName === routeNames.execution && permissionKeys.includes("execution.manage") ? routeNames.executionManagement : routeName
}

export function hasRoutePermission(permissionKeys: readonly StaffPermissionKey[], meta: PermissionMeta, capabilities: PlatformCapabilities = enabledPlatformCapabilities): boolean {
  const requiredPermission = readPermission(meta.requiredPermission)
  if (requiredPermission !== null && (!permissionKeys.includes(requiredPermission) || !hasPermissionCapability(requiredPermission, meta, capabilities))) {
    return false
  }
  const requiredCapability = readCapability(meta.requiredCapability)
  if (requiredCapability !== null && !capabilities[requiredCapability]) {
    return false
  }
  const requiredAnyPermission = readPermissionList(meta.requiredAnyPermission)
  return requiredAnyPermission === null || requiredAnyPermission.some((permissionKey) => permissionKeys.includes(permissionKey) && hasPermissionCapability(permissionKey, meta, capabilities))
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

function readCapability(value: unknown): PlatformCapabilityKey | null {
  if (value === "wechatPaymentEnabled" || value === "wechatRefundEnabled" || value === "paymentReconciliationEnabled") {
    return value
  }
  return null
}

function readPermissionCapabilities(value: unknown): readonly PermissionCapability[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((item): PermissionCapability[] => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return []
    }
    const record = item as Record<string, unknown>
    const permissionKey = readPermission(record["permissionKey"])
    const capabilityKey = readCapability(record["capabilityKey"])
    return permissionKey !== null && capabilityKey !== null ? [{ permissionKey, capabilityKey }] : []
  })
}

function hasPermissionCapability(permissionKey: StaffPermissionKey, meta: PermissionMeta, capabilities: PlatformCapabilities): boolean {
  const gate = readPermissionCapabilities(meta.permissionCapabilities).find(item => item.permissionKey === permissionKey)
  return gate === undefined || capabilities[gate.capabilityKey]
}
