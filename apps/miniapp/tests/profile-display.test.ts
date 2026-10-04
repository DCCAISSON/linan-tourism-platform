import { afterEach, describe, expect, it, vi } from "vitest"
import { loadLocalProfile, saveLocalProfile } from "../src/profile-display"

describe("local display profile", () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it("keeps a user-confirmed profile separate for each household", () => {
    // Given: two signed-in households sharing one device.
    const storage = new Map<string, unknown>()
    vi.stubGlobal("uni", {
      getStorageSync: (key: string) => storage.get(key),
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    })

    // When: one household saves its explicitly chosen display details.
    saveLocalProfile("family:one", { nickname: "小林", avatarPath: "wxfile://avatar-one" })

    // Then: only that household can read them.
    expect(loadLocalProfile("family:one")).toEqual({ nickname: "小林", avatarPath: "wxfile://avatar-one" })
    expect(loadLocalProfile("family:two")).toBeNull()
  })
})
