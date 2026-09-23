import { createRouter, createWebHistory } from "vue-router"

import { getCurrentStaff } from "@/api/auth"
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
    const staff = await getCurrentStaff()
    if (staff.forcePasswordChange) {
      return { name: routeNames.forcePasswordChange }
    }
    if (!hasRoutePermission(staff.permissionKeys, to.meta)) {
      const routeName = firstAuthorizedRouteName(staff.permissionKeys)
      return routeName === null ? { name: routeNames.login } : { name: routeName }
    }
    return true
  } catch {
    return { name: routeNames.login, query: { redirect: to.fullPath } }
  }
})
