import { describe, expect, it } from "vitest"

import { routeNames, routes } from "@/router/routes"

describe("admin routes", () => {
  it("exposes login shell, empty home, configuration, roster, and orders routes", () => {
    expect(routes).toHaveLength(2)
    expect(routes.map(route => route.path)).toEqual(["/login", "/"])
    expect(routeNames).toEqual({
      configuration: "configuration",
      home: "home",
      login: "login",
      orders: "orders",
      roster: "roster",
    })
    expect(routes[1]?.children?.map(route => route.path)).toEqual(["home", "configuration", "roster", "orders"])
  })
})
