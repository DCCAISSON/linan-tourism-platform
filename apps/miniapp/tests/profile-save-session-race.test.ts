import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { compileScript, parse } from "vue/compiler-sfc"
import { ModuleKind, transpileModule } from "typescript"
import * as vue from "vue"
import { expect, it, vi } from "vitest"

type ProfileLoginSheet = {
  readonly authorizePhone: (event: { readonly detail?: { readonly code?: unknown } }) => Promise<void>
  readonly chooseAvatar: (event: { readonly detail?: { readonly avatarUrl?: unknown } }) => void
  readonly saveProfile: (event?: { readonly detail?: { readonly value?: { readonly nickname?: unknown } } }) => Promise<void>
  readonly error: vue.Ref<string>
}

it("discards an avatar saved after the phone session changes", async () => {
  const { descriptor } = parse(readFileSync(new URL("../src/components/ProfileLoginSheet.vue", import.meta.url), "utf8"))
  const code = transpileModule(compileScript(descriptor, { id: "profile-login-sheet" }).content, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
  let token: string | undefined
  let finishAvatar: (path: string) => void = () => { throw new Error("Avatar did not start") }
  const persistAvatar = vi.fn(() => new Promise<string>((resolve) => { finishAvatar = resolve }))
  const discardPersistedAvatar = vi.fn()
  const saveLocalProfile = vi.fn()
  const emitted = vi.fn()
  const exports: { default?: { setup: (props: object, context: object) => ProfileLoginSheet } } = {}

  runInNewContext(code, {
    exports,
    Error,
    uni: {
      login: (options: { readonly success: (result: { readonly code: string }) => void }) => options.success({ code: "wx-code" }),
      showToast: vi.fn(),
    },
    require: (name: string) => {
      if (name === "vue") return { ...vue, onUnmounted: vi.fn() }
      if (name.endsWith("/api")) return { createMiniappApi: () => ({ loginWithWechatPhone: async () => { token = "account-a"; return { token, familyCode: "family-a", expiresAt: "2026-10-03T00:00:00.000Z", phoneVerified: true } } }) }
      if (name.endsWith("profile-display")) return { discardPersistedAvatar, loadLocalProfile: () => null, persistAvatar, saveLocalProfile }
      if (name.endsWith("service-consent")) return { hasServiceConsent: () => true }
      if (name.endsWith("user-notification-api")) return { createUserNotificationApi: () => ({ overview: async () => [] }), requestUserSubscriptions: vi.fn() }
      if (name.endsWith("wechat-token")) return {
        clearWechatSessionTokenIfCurrent: vi.fn(),
        getEnrollmentDraftOwner: () => token === "account-a" ? "family:family-a" : token === "account-b" ? "family:family-b" : "guest",
        getWechatSessionToken: () => token,
      }
      if (name.endsWith("ServiceConsent.vue")) return { default: {} }
      return {}
    },
  })
  if (exports.default === undefined) throw new Error("Missing profile login sheet")
  const sheet = exports.default.setup({ requirePhone: true }, { expose: vi.fn(), emit: emitted })

  await sheet.authorizePhone({ detail: { code: "phone-code" } })
  sheet.chooseAvatar({ detail: { avatarUrl: "wxfile://temporary-avatar" } })
  const saving = sheet.saveProfile({ detail: { value: { nickname: "小林" } } })
  expect(persistAvatar).toHaveBeenCalledWith("wxfile://temporary-avatar")

  token = "account-b"
  finishAvatar("wxfile://saved-avatar")
  await saving

  expect(discardPersistedAvatar).toHaveBeenCalledWith("wxfile://saved-avatar")
  expect(saveLocalProfile).not.toHaveBeenCalled()
  expect(emitted.mock.calls.some(([event]) => event === "completed")).toBe(false)
  expect(sheet.error.value).toContain("登录信息已变更")
})
