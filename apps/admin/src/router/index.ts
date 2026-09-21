import { createRouter, createWebHistory } from "vue-router"

import { getCurrentStaff, staffPermissionKeys, type StaffPermissionKey } from "@/api/auth"
import { routes } from "./routes"
import { routeNames } from "./routes"

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach(async (to) => {
  if (to.name === routeNames.login || to.name === routeNames.forcePasswordChange) {
    return true
  }
  try {
    const staff = await getCurrentStaff()
    if (staff.forcePasswordChange) {
      return { name: routeNames.forcePasswordChange }
    }
    const requiredPermission = readRequiredPermission(to.meta["requiredPermission"])
    if (requiredPermission !== null && !staff.permissionKeys.includes(requiredPermission)) {
      return { name: routeNames.home }
    }
    return true
  } catch {
    return { name: routeNames.login, query: { redirect: to.fullPath } }
  }
})

function readRequiredPermission(value: unknown): StaffPermissionKey | null {
  if (typeof value !== "string") {
    return null
  }
  for (const permissionKey of staffPermissionKeys) {
    if (permissionKey === value) {
      return permissionKey
    }
  }
  return null
}
