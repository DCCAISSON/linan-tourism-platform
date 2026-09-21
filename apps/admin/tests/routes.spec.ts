import { describe, expect, it } from "vitest"

import { firstAuthorizedRouteName } from "@/router/authorized-route"
import { routeNames, routes } from "@/router/routes"

describe("admin routes", () => {
  it("exposes login, password-change, and permission-gated admin routes", () => {
    expect(routes).toHaveLength(3)
    expect(routes.map(route => route.path)).toEqual(["/login", "/force-password-change", "/"])
    expect(routeNames).toEqual({
      configuration: "configuration",
      forcePasswordChange: "force-password-change",
      home: "home",
      login: "login",
      orders: "orders",
      roster: "roster",
      staffAccounts: "staff-accounts",
      transport: "transport",
    })
    expect(routes[2]?.children?.map(route => route.path)).toEqual([
      "home",
      "configuration",
      "roster",
      "orders",
      "transport",
      "staff-accounts",
    ])
    expect(routes[2]?.children?.map(route => route.meta?.["requiredPermission"])).toEqual([
      "workbench.read",
      "configuration.read",
      "roster.read",
      "orders.read",
      "transport.read",
      "staff_accounts.manage",
    ])
  })

  it("chooses the first route the staff account is allowed to open", () => {
    expect(firstAuthorizedRouteName(["roster.read"])).toBe(routeNames.roster)
    expect(firstAuthorizedRouteName(["orders.read", "roster.read"])).toBe(routeNames.roster)
    expect(firstAuthorizedRouteName([])).toBeNull()
  })
})
