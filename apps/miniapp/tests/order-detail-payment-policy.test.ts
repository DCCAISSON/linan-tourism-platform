import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const source = readFileSync(new URL("../src/pages/orders/detail.vue", import.meta.url), "utf8")

describe("order detail payment policy", () => {
  it("uses WeChat payment when enabled and keeps mock behind non-production fallback", () => {
    // Given
    const payStart = source.indexOf("async function pay()")
    const payEnd = source.indexOf("async function loginForWechatPayment")
    const paySource = source.slice(payStart, payEnd)

    // When
    const loginIndex = paySource.indexOf("await loginForWechatPayment()")
    const createIndex = paySource.indexOf("api.createWechatPayment(orderId.value, code)")
    const requestIndex = paySource.indexOf("await requestWechatPayment(payment.miniappPayment)")
    const loadIndex = paySource.indexOf("await load()")

    // Then
    expect(source).not.toContain("?".repeat(4))
    expect(paySource).toContain("if (wechatPayEnabled)")
    expect(paySource).toContain("if (productionBuild) throw new Error")
    expect(paySource).toContain("await api.createMockPayment(orderId.value)")
    expect(loginIndex).toBeGreaterThanOrEqual(0)
    expect(createIndex).toBeGreaterThan(loginIndex)
    expect(requestIndex).toBeGreaterThan(createIndex)
    expect(loadIndex).toBeGreaterThan(requestIndex)
  })

  it("renders mode-specific payment button and notice", () => {
    // Given / When / Then
    expect(source).toContain("const paymentButtonText = computed")
    expect(source).toContain("const paymentActionDisabled = computed")
    expect(source).toContain("const paymentModeNotice = computed")
    expect(source).toContain(":disabled=\"paymentActionDisabled\"")
    expect(source).toContain("{{ paymentButtonText }}")
    expect(source).toContain("{{ paymentModeNotice }}")
  })
})
