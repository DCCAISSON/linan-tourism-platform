import type { RouteRecordRaw } from "vue-router"

import AdminLayout from "@/layouts/AdminLayout.vue"
import BusinessView from "@/views/BusinessView.vue"
import ConfigurationView from "@/views/ConfigurationView.vue"
import ContractsView from "@/views/ContractsView.vue"
import CrmView from "@/views/CrmView.vue"
import EvaluationStandardsView from "@/views/EvaluationStandardsView.vue"
import EvaluationsView from "@/views/EvaluationsView.vue"
import ExecutionManagementView from "@/views/ExecutionManagementView.vue"
import FeedbackView from "@/views/FeedbackView.vue"
import ForcePasswordChangeView from "@/views/ForcePasswordChangeView.vue"
import GuideSessionView from "@/views/GuideSessionView.vue"
import GuideView from "@/views/GuideView.vue"
import HealthAccessView from "@/views/HealthAccessView.vue"
import HomeView from "@/views/HomeView.vue"
import InsuranceView from "@/views/InsuranceView.vue"
import LoginView from "@/views/LoginView.vue"
import MediaView from "@/views/MediaView.vue"
import NotificationsView from "@/views/NotificationsView.vue"
import RosterView from "@/views/RosterView.vue"
import OrdersView from "@/views/OrdersView.vue"
import OrderChangesView from "@/views/OrderChangesView.vue"
import PaymentReconciliationView from "@/views/PaymentReconciliationView.vue"
import PretripView from "@/views/PretripView.vue"
import RefundApplicationsView from "@/views/RefundApplicationsView.vue"
import SchoolConfirmationView from "@/views/SchoolConfirmationView.vue"
import SessionArchivesView from "@/views/SessionArchivesView.vue"
import StaffAccountsView from "@/views/StaffAccountsView.vue"
import TransportView from "@/views/TransportView.vue"
import TravelersView from "@/views/TravelersView.vue"

export const routeNames = {
  business: "business",
  configuration: "configuration",
  contracts: "contracts",
  crm: "crm",
  evaluations: "evaluations",
  evaluationStandards: "evaluation-standards",
  feedback: "feedback",
  execution: "execution",
  executionSession: "execution-session",
  executionManagement: "execution-management",
  healthAccess: "health-access",
  home: "home",
  insurance: "insurance",
  login: "login",
  media: "media",
  notifications: "notifications",
  forcePasswordChange: "force-password-change",
  roster: "roster",
  orders: "orders",
  orderChanges: "order-changes",
  paymentReconciliation: "payment-reconciliation",
  pretrip: "pretrip",
  refundApplications: "refund-applications",
  schoolConfirmation: "school-confirmation",
  sessionArchives: "session-archives",
  transport: "transport",
  travelers: "travelers",
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
        path: "contracts",
        name: routeNames.contracts,
        component: ContractsView,
        meta: { title: "团期合同", requiredPermission: "configuration.read" },
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
        path: "travelers",
        name: routeNames.travelers,
        component: TravelersView,
        meta: { title: "出行人员", requiredPermission: "roster.read" },
      },
      {
        path: "orders",
        name: routeNames.orders,
        component: OrdersView,
        meta: { title: "订单管理", requiredPermission: "orders.read" },
      },
      {
        path: "order-changes",
        name: routeNames.orderChanges,
        component: OrderChangesView,
        meta: { title: "人员变更申请", requiredPermission: "orders.read" },
      },
      {
        path: "refund-applications",
        name: routeNames.refundApplications,
        component: RefundApplicationsView,
        meta: {
          title: "退款申请",
          requiredAnyPermission: ["refunds.review", "refunds.execute"],
          permissionCapabilities: [{ permissionKey: "refunds.execute", capabilityKey: "wechatRefundEnabled" }],
        },
      },
      {
        path: "payments/reconciliation",
        name: routeNames.paymentReconciliation,
        component: PaymentReconciliationView,
        meta: { title: "支付对账", requiredPermission: "payments.reconcile", requiredCapability: "paymentReconciliationEnabled" },
      },
      {
        path: "transport",
        name: routeNames.transport,
        component: TransportView,
        meta: { title: "车辆安排", requiredPermission: "transport.read" },
      },
      {
        path: "pretrip",
        name: routeNames.pretrip,
        component: PretripView,
        meta: { title: "行前配置", requiredPermission: "pretrip.write" },
      },
      {
        path: "school-confirmation",
        name: routeNames.schoolConfirmation,
        component: SchoolConfirmationView,
        meta: { title: "学校行前签认", requiredPermission: "pretrip.school_confirm" },
      },
      {
        path: "notifications",
        name: routeNames.notifications,
        component: NotificationsView,
        meta: { title: "通知管理", requiredPermission: "notifications.read" },
      },
      {
        path: "execution",
        name: routeNames.execution,
        component: GuideView,
        meta: { title: "导游执行", requiredPermission: "execution.read" },
      },
      {
        path: "execution/management",
        name: routeNames.executionManagement,
        component: ExecutionManagementView,
        meta: { title: "执行管理", requiredPermission: "execution.read", requiredAnyPermission: ["execution.manage"] },
      },
      {
        path: "execution/sessions/:sessionId",
        name: routeNames.executionSession,
        component: GuideSessionView,
        meta: { title: "团期执行", requiredPermission: "execution.read" },
      },
      {
        path: "health-access",
        name: routeNames.healthAccess,
        component: HealthAccessView,
        meta: { title: "健康授权", requiredPermission: "health.read" },
      },
      {
        path: "evaluations",
        name: routeNames.evaluations,
        component: EvaluationsView,
        meta: { title: "学生评价", requiredAnyPermission: ["evaluations.read", "evaluations.school_report"] },
      },
      {
        path: "evaluation-standards",
        name: routeNames.evaluationStandards,
        component: EvaluationStandardsView,
        meta: { title: "评价标准", requiredAnyPermission: ["evaluations.standard.write", "evaluations.standard.confirm"] },
      },
      {
        path: "feedback",
        name: routeNames.feedback,
        component: FeedbackView,
        meta: { title: "服务反馈", requiredAnyPermission: ["feedback.read", "feedback.submit"] },
      },
      {
        path: "insurance",
        name: routeNames.insurance,
        component: InsuranceView,
        meta: { title: "保险工作台", requiredPermission: "insurance.read" },
      },
      {
        path: "media",
        name: routeNames.media,
        component: MediaView,
        meta: { title: "影像管理", requiredPermission: "media.read" },
      },
      {
        path: "crm",
        name: routeNames.crm,
        component: CrmView,
        meta: { title: "客户管理", requiredPermission: "crm.read" },
      },
      {
        path: "business",
        name: routeNames.business,
        component: BusinessView,
        meta: { title: "商旅业务", requiredAnyPermission: ["business.read", "business.write", "business.followup"] },
      },
      {
        path: "session-archives",
        name: routeNames.sessionArchives,
        component: SessionArchivesView,
        meta: { title: "团期归档", requiredAnyPermission: ["orders.read", "roster.export", "transport.export", "execution.manage", "evaluations.school_report"] },
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
