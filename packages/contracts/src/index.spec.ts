import { describe, expect, it } from "vitest"
import { HEALTH_STATUS, type HealthResponse } from "./index.js"

describe("health contract", () => {
  it("allows the API health response shape", () => {
    const response: HealthResponse = {
      status: HEALTH_STATUS.ok,
      service: "@linan/api",
    }

    expect(response.status).toBe("ok")
  })
})
