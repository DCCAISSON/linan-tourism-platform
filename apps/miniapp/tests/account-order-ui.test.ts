import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const family = readFileSync(new URL("../src/pages/family/index.vue", import.meta.url), "utf8")
const settings = readFileSync(new URL("../src/pages/settings/index.vue", import.meta.url), "utf8")
const orders = readFileSync(new URL("../src/pages/orders/index.vue", import.meta.url), "utf8")
const refund = readFileSync(new URL("../src/pages/orders/refund.vue", import.meta.url), "utf8")
const health = readFileSync(new URL("../src/pages/health/index.vue", import.meta.url), "utf8")

describe("account and order page hierarchy", () => {
  it("keeps guest account data private while leaving real shortcuts reachable", () => {
    expect(family).toContain('v-if="!authenticated" class="info-card family-guest-card"')
    expect(family).not.toContain("<ServiceConsent")
    expect(family).toContain('class="family-settings-button"')
    expect(family).toContain('url: "/pages/settings/index"')
    expect(settings).not.toContain("<ServiceConsent")
    expect(settings).toContain('class="info-card settings-row"')
    expect(family).toContain('if (cause instanceof ApiError && cause.statusCode === 401)')
  })

  it("keeps real order amounts and refund eligibility visible in their existing states", () => {
    expect(orders).toContain("formatFen(order.amountFen)")
    expect(refund).toContain("order.value?.status === \"paid\"")
    expect(refund).toContain('class="refund-action-bar"')
  })

  it("groups health summaries, authorization inputs and feedback as one readable page", () => {
    expect(health).toContain('class="discovery-page health-page"')
    expect(health).toContain('class="info-card health-summary"')
    expect(health).toContain('class="info-card health-form"')
    expect(health).toContain("health-message")
  })
})
