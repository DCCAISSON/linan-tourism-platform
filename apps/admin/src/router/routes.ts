import type { RouteRecordRaw } from "vue-router"

import AdminLayout from "@/layouts/AdminLayout.vue"
import ConfigurationView from "@/views/ConfigurationView.vue"
import HomeView from "@/views/HomeView.vue"
import LoginView from "@/views/LoginView.vue"

export const routeNames = {
  configuration: "configuration",
  home: "home",
  login: "login",
} as const

export const routes: RouteRecordRaw[] = [
  {
    path: "/login",
    name: routeNames.login,
    component: LoginView,
    meta: {
      title: "登录",
    },
  },
  {
    path: "/",
    component: AdminLayout,
    redirect: "/home",
    children: [
      {
        path: "home",
        name: routeNames.home,
        component: HomeView,
        meta: {
          title: "首页",
        },
      },
      {
        path: "configuration",
        name: routeNames.configuration,
        component: ConfigurationView,
        meta: {
          title: "配置",
        },
      },
    ],
  },
]
