import { afterEach, describe, expect, it, vi } from "vitest"
import { hasCompletedLocalProfile, saveLocalProfile } from "../src/profile-display"

describe("profile session completion", () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it("does not treat a phone session as complete until the user saves the profile form", () => {
    const storage = new Map<string, unknown>()
    vi.stubGlobal("uni", {
      getStorageSync: (key: string) => storage.get(key),
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    })

    expect(hasCompletedLocalProfile("family:one")).toBe(false)

    saveLocalProfile("family:one", { nickname: "", avatarPath: "" })

    expect(hasCompletedLocalProfile("family:one")).toBe(true)
    expect(hasCompletedLocalProfile("family:two")).toBe(false)
  })
})
