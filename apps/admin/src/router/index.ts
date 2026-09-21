import { createRouter, createWebHistory } from "vue-router"

import { getCurrentStaff } from "@/api/auth"
import { routes } from "./routes"
import { routeNames } from "./routes"

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach(async (to) => {
  if (to.name === routeNames.login) {
    return true
  }
  try {
    await getCurrentStaff()
    return true
  } catch {
    return { name: routeNames.login, query: { redirect: to.fullPath } }
  }
})
