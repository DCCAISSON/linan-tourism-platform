import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { acceptServiceConsent, declineServiceConsent, hasSeenServiceConsent, hasServiceConsent } from "../src/service-consent"

describe("service consent", () => {
  const storage = new Map<string, unknown>()
  beforeEach(() => {
    storage.clear()
    vi.stubGlobal("uni", {
      getStorageSync: (key: string) => storage.get(key),
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    })
  })
  afterEach(() => { vi.unstubAllGlobals() })
  it("allows a browsing choice without treating it as enrollment consent", () => {
    expect(hasSeenServiceConsent()).toBe(false)
    declineServiceConsent()
    expect(hasSeenServiceConsent()).toBe(true)
    expect(hasServiceConsent()).toBe(false)
    acceptServiceConsent()
    expect(hasServiceConsent()).toBe(true)
  })
  it("requires renewed confirmation for an older statement version", () => {
    storage.set("linan_service_consent", { version: "old", choice: "accepted" })
    expect(hasSeenServiceConsent()).toBe(false)
    expect(hasServiceConsent()).toBe(false)
  })
})
