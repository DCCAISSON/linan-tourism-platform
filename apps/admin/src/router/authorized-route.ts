import type { StaffPermissionKey } from "@/api/auth"
import { routeNames } from "./routes"

const authorizedRouteOrder: readonly { readonly permissionKey: StaffPermissionKey; readonly routeName: string }[] = [
  { permissionKey: "workbench.read", routeName: routeNames.home },
  { permissionKey: "configuration.read", routeName: routeNames.configuration },
  { permissionKey: "roster.read", routeName: routeNames.roster },
  { permissionKey: "orders.read", routeName: routeNames.orders },
  { permissionKey: "transport.read", routeName: routeNames.transport },
  { permissionKey: "staff_accounts.manage", routeName: routeNames.staffAccounts },
]

export function firstAuthorizedRouteName(permissionKeys: readonly StaffPermissionKey[]): string | null {
  return authorizedRouteOrder.find((route) => permissionKeys.includes(route.permissionKey))?.routeName ?? null
}
