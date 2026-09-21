import { describe, expect, it } from "vitest"

import { routeNames, routes } from "@/router/routes"

describe("admin routes", () => {
  it("exposes login shell, home, configuration, roster, orders, and staff account routes", () => {
    expect(routes).toHaveLength(2)
    expect(routes.map(route => route.path)).toEqual(["/login", "/"])
    expect(routeNames).toEqual({
      configuration: "configuration",
      home: "home",
      login: "login",
      orders: "orders",
      roster: "roster",
      staffAccounts: "staff-accounts",
    })
    expect(routes[1]?.children?.map(route => route.path)).toEqual(["home", "configuration", "roster", "orders", "staff-accounts"])
  })
})
