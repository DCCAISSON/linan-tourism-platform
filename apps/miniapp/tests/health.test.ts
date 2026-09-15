import { describe, expect, it } from "vitest"
import { HEALTH_COPY } from "../src/health"

describe("HEALTH_COPY", () => {
  it("reports scaffold readiness when the miniapp shell loads", () => {
    expect(HEALTH_COPY.status).toBe("骨架已就绪")
    expect(HEALTH_COPY.checkpoints).toContain("微信小程序")
  })
})
