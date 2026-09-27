import { describe, expect, it } from "vitest"

import { firstAuthorizedRouteName, hasRoutePermission } from "@/router/authorized-route"
import { routeNames, routes } from "@/router/routes"

describe("admin routes", () => {
  it("allows either explicitly accepted permission for a shared workflow route", () => {
    const meta = { requiredAnyPermission: ["refunds.review", "refunds.execute"], permissionCapabilities: [{ permissionKey: "refunds.execute", capabilityKey: "wechatRefundEnabled" }] }
    expect(hasRoutePermission(["refunds.review"], meta)).toBe(true)
    expect(hasRoutePermission(["refunds.execute"], meta)).toBe(true)
    expect(hasRoutePermission(["refunds.execute"], meta, { wechatPaymentEnabled: true, wechatRefundEnabled: false, paymentReconciliationEnabled: true })).toBe(false)
    expect(hasRoutePermission(["refunds.manage"], meta)).toBe(false)
    expect(hasRoutePermission([], meta)).toBe(false)
  })

  it("requires an enabled platform capability for payment reconciliation", () => {
    const meta = { requiredPermission: "payments.reconcile", requiredCapability: "paymentReconciliationEnabled" }
    expect(hasRoutePermission(["payments.reconcile"], meta)).toBe(true)
    expect(hasRoutePermission(["payments.reconcile"], meta, { wechatPaymentEnabled: true, wechatRefundEnabled: true, paymentReconciliationEnabled: false })).toBe(false)
  })

  it("does not ignore a required permission when another accepted grant is present", () => {
    const meta = { requiredPermission: "sensitive_data.read", requiredAnyPermission: ["health.read"] }
    expect(hasRoutePermission(["health.read"], meta)).toBe(false)
    expect(hasRoutePermission(["health.read", "sensitive_data.read"], meta)).toBe(true)
  })

  it("exposes login, password-change, and permission-gated admin routes", () => {
    expect(routes).toHaveLength(3)
    expect(routes.map(route => route.path)).toEqual(["/login", "/force-password-change", "/"])
    expect(routeNames).toEqual({
      business: "business",
      configuration: "configuration",
      crm: "crm",
      evaluations: "evaluations",
      evaluationStandards: "evaluation-standards",
      execution: "execution",
      executionSession: "execution-session",
      feedback: "feedback",
      forcePasswordChange: "force-password-change",
      healthAccess: "health-access",
      home: "home",
      insurance: "insurance",
      login: "login",
      media: "media",
      notifications: "notifications",
      orders: "orders",
      paymentReconciliation: "payment-reconciliation",
      pretrip: "pretrip",
      refundApplications: "refund-applications",
      roster: "roster",
      schoolConfirmation: "school-confirmation",
      staffAccounts: "staff-accounts",
      transport: "transport",
      travelers: "travelers",
    })
    expect(routes[2]?.children?.map(route => route.path)).toEqual([
      "home",
      "configuration",
      "roster",
      "travelers",
      "orders",
      "refund-applications",
      "payments/reconciliation",
      "transport",
      "pretrip",
      "school-confirmation",
      "notifications",
      "execution",
      "execution/sessions/:sessionId",
      "health-access",
      "evaluations",
      "evaluation-standards",
      "feedback",
      "insurance",
      "media",
      "crm",
      "business",
      "staff-accounts",
    ])
    expect(routes[2]?.children?.map(route => route.meta?.["requiredPermission"])).toEqual([
      "workbench.read",
      "configuration.read",
      "roster.read",
      "roster.read",
      "orders.read",
      undefined,
      "payments.reconcile",
      "transport.read",
      "pretrip.write",
      "pretrip.school_confirm",
      "notifications.read",
      "execution.read",
      "execution.read",
      "health.read",
      undefined,
      undefined,
      "feedback.read",
      "insurance.read",
      "media.read",
      "crm.read",
      "business.read",
      "staff_accounts.manage",
    ])
    expect(routes[2]?.children?.find(route => route.name === routeNames.refundApplications)?.meta?.["requiredAnyPermission"]).toEqual([
      "refunds.review",
      "refunds.execute",
    ])
    expect(routes[2]?.children?.find(route => route.name === routeNames.paymentReconciliation)?.meta?.["requiredCapability"]).toBe("paymentReconciliationEnabled")
    expect(routes[2]?.children?.find(route => route.name === routeNames.evaluations)?.meta?.["requiredAnyPermission"]).toEqual(["evaluations.read", "evaluations.school_report"])
    expect(routes[2]?.children?.find(route => route.name === routeNames.evaluationStandards)?.meta?.["requiredAnyPermission"]).toEqual(["evaluations.standard.write", "evaluations.standard.confirm"])
  })

  it("chooses the first route the staff account is allowed to open", () => {
    expect(firstAuthorizedRouteName(["roster.read"])).toBe(routeNames.roster)
    expect(firstAuthorizedRouteName(["orders.read", "roster.read"])).toBe(routeNames.roster)
    expect(firstAuthorizedRouteName(["payments.reconcile"])).toBe(routeNames.paymentReconciliation)
    expect(firstAuthorizedRouteName(["payments.reconcile"], { wechatPaymentEnabled: true, wechatRefundEnabled: true, paymentReconciliationEnabled: false })).toBeNull()
    expect(firstAuthorizedRouteName(["refunds.execute"], { wechatPaymentEnabled: true, wechatRefundEnabled: false, paymentReconciliationEnabled: true })).toBeNull()
    expect(firstAuthorizedRouteName(["refunds.review"], { wechatPaymentEnabled: true, wechatRefundEnabled: false, paymentReconciliationEnabled: true })).toBe(routeNames.refundApplications)
    expect(firstAuthorizedRouteName(["pretrip.write"])).toBe(routeNames.pretrip)
    expect(firstAuthorizedRouteName(["pretrip.school_confirm"])).toBe(routeNames.schoolConfirmation)
    expect(firstAuthorizedRouteName(["notifications.read"])).toBe(routeNames.notifications)
    expect(firstAuthorizedRouteName(["execution.read"])).toBe(routeNames.execution)
    expect(firstAuthorizedRouteName(["health.read"])).toBe(routeNames.healthAccess)
    expect(firstAuthorizedRouteName(["evaluations.school_report"])).toBe(routeNames.evaluations)
    expect(firstAuthorizedRouteName(["evaluations.standard.confirm"])).toBe(routeNames.evaluationStandards)
    expect(firstAuthorizedRouteName([])).toBeNull()
  })
})
