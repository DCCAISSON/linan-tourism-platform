import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const login = readFileSync(new URL("../src/pages/login/index.vue", import.meta.url), "utf8")
const family = readFileSync(new URL("../src/pages/family/index.vue", import.meta.url), "utf8")
const profileSheet = readFileSync(new URL("../src/components/ProfileLoginSheet.vue", import.meta.url), "utf8")

describe("phone-first account profile surfaces", () => {
  it("keeps login subscription in the same flow and offers only user-confirmed profile fields", () => {
    expect(login).toContain("ProfileLoginSheet")
    expect(profileSheet).toContain('open-type="chooseAvatar"')
    expect(profileSheet).toContain('type="nickname"')
    expect(profileSheet).toContain('open-type="getPhoneNumber"')
    expect(profileSheet).toContain('form-type="submit"')
    expect(profileSheet).toContain("requestUserSubscriptions")
  })

  it("shows an explicitly saved local profile in My and uses phone-login language", () => {
    expect(family).toContain("loadLocalProfile")
    expect(family).toContain("登录/注册")
    expect(family).toContain('class="family-settings-button"')
  })
})
