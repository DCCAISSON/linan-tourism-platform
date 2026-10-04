import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("first visit privacy persistence", () => {
  const storage = new Map<string, unknown>()
  beforeEach(() => {
    vi.resetModules()
    storage.clear()
    vi.stubGlobal("uni", {
      getStorageSync: (key: string) => storage.get(key),
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    })
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it("shows the first-visit policy again after a previously persisted browsing refusal", async () => {
    storage.set("linan_service_consent", { version: "2026-10-03", choice: "declined" })
    const consent = await import("../src/service-consent")
    expect(consent.hasSeenServiceConsent()).toBe(false)
    expect(consent.hasServiceConsent()).toBe(false)
  })

  it("allows browsing in this runtime but asks again on a fresh launch", async () => {
    const consent = await import("../src/service-consent")
    consent.declineServiceConsent()
    expect(consent.hasSeenServiceConsent()).toBe(true)
    expect(consent.hasServiceConsent()).toBe(false)
    expect(storage.has("linan_service_consent")).toBe(false)
    vi.resetModules()
    const relaunched = await import("../src/service-consent")
    expect(relaunched.hasSeenServiceConsent()).toBe(false)
  })

  it("remembers explicit agreement across launches", async () => {
    const consent = await import("../src/service-consent")
    consent.acceptServiceConsent()
    vi.resetModules()
    const relaunched = await import("../src/service-consent")
    expect(relaunched.hasSeenServiceConsent()).toBe(true)
    expect(relaunched.hasServiceConsent()).toBe(true)
  })

  it("requires confirmation of the expanded policy when only the old policy was accepted", async () => {
    storage.set("linan_service_consent", { version: "2026-10-03", choice: "accepted" })
    const consent = await import("../src/service-consent")
    expect(consent.hasServiceConsent()).toBe(false)
  })
})
