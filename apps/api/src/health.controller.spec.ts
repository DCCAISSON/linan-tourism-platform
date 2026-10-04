import { describe, expect, it } from "vitest"
import { HealthController } from "./health.controller.js"

describe("HealthController", () => {
  it("returns the health contract when requested", () => {
    const controller = new HealthController()

    const response = controller.getHealth()

    expect(response).toEqual({
      status: "ok",
      service: "@linan/api",
      revision: "local",
    })
  })
})
