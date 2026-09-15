import { describe, expect, it } from "vitest"

import { routeNames, routes } from "@/router/routes"

describe("admin routes", () => {
  it("exposes only login shell and empty home when scaffold starts", () => {
    expect(routes).toHaveLength(2)
    expect(routes.map(route => route.path)).toEqual(["/login", "/"])
    expect(routeNames).toEqual({
      home: "home",
      login: "login",
    })
  })
})
