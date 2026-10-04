import { createRouter, createWebHistory } from "vue-router"

import { getCurrentStaff } from "@/api/auth"
import { getCapabilities } from "@/api/capabilities"
import { firstAuthorizedRouteName, hasRoutePermission } from "./authorized-route"
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
    const [staff, capabilities] = await Promise.all([getCurrentStaff(), getCapabilities()])
    if (staff.forcePasswordChange) {
      return { name: routeNames.forcePasswordChange }
    }
    if (!hasRoutePermission(staff.permissionKeys, to.meta, capabilities)) {
      const routeName = firstAuthorizedRouteName(staff.permissionKeys, capabilities)
      return routeName === null ? { name: routeNames.login } : { name: routeName }
    }
    return true
  } catch {
    return { name: routeNames.login, query: { redirect: to.fullPath } }
  }
})
