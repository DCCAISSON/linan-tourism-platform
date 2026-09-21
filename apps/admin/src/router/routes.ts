import type { RouteRecordRaw } from "vue-router"

import AdminLayout from "@/layouts/AdminLayout.vue"
import ConfigurationView from "@/views/ConfigurationView.vue"
import ForcePasswordChangeView from "@/views/ForcePasswordChangeView.vue"
import HomeView from "@/views/HomeView.vue"
import LoginView from "@/views/LoginView.vue"
import RosterView from "@/views/RosterView.vue"
import OrdersView from "@/views/OrdersView.vue"
import StaffAccountsView from "@/views/StaffAccountsView.vue"
import TransportView from "@/views/TransportView.vue"

export const routeNames = {
  configuration: "configuration",
  home: "home",
  login: "login",
  forcePasswordChange: "force-password-change",
  roster: "roster",
  orders: "orders",
  transport: "transport",
  staffAccounts: "staff-accounts",
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
    path: "/force-password-change",
    name: routeNames.forcePasswordChange,
    component: ForcePasswordChangeView,
    meta: {
      title: "修改密码",
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
          requiredPermission: "workbench.read",
        },
      },
      {
        path: "configuration",
        name: routeNames.configuration,
        component: ConfigurationView,
        meta: {
          title: "配置",
          requiredPermission: "configuration.read",
        },
      },
      {
        path: "roster",
        name: routeNames.roster,
        component: RosterView,
        meta: {
          title: "名单统计",
          requiredPermission: "roster.read",
        },
      },
      {
        path: "orders",
        name: routeNames.orders,
        component: OrdersView,
        meta: { title: "订单管理", requiredPermission: "orders.read" },
      },
      {
        path: "transport",
        name: routeNames.transport,
        component: TransportView,
        meta: { title: "车辆安排", requiredPermission: "transport.read" },
      },
      {
        path: "staff-accounts",
        name: routeNames.staffAccounts,
        component: StaffAccountsView,
        meta: { title: "账号权限", requiredPermission: "staff_accounts.manage" },
      },
    ],
  },
]
