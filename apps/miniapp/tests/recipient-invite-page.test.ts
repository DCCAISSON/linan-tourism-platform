import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { compileScript, parse } from "vue/compiler-sfc"
import { ModuleKind, transpileModule } from "typescript"
import * as vue from "vue"
import { afterEach, describe, expect, it, vi } from "vitest"

type Page = {
  readonly message: vue.Ref<string>
  readonly authorizationId: vue.Ref<string>
  readonly detail: vue.Ref<{ readonly status: string } | null>
  readonly formatDate: (value: string) => string
  readonly withdraw: () => Promise<void>
}
const api = {
  withdrawRecipient: vi.fn(async () => {}),
  getRecipientTrip: vi.fn(async () => ({ authorizationId: "recipient", receiverName: "出行人", status: "revoked", expiresAt: null, trip: null, entries: [], templates: [] })),
}

function setup(name: "recipient-invite" | "trip-contact"): Page {
  const source = readFileSync(new URL(`../src/pages/${name}/index.vue`, import.meta.url), "utf8")
  const compiled = compileScript(parse(source).descriptor, { id: name })
  const code = transpileModule(compiled.content, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
  const exports: { default?: { setup: (props: object, context: object) => Page } } = {}
  runInNewContext(code, { exports, Date, Error, uni: { showModal: (options: { success: (value: { confirm: boolean }) => void }) => options.success({ confirm: true }) }, require: (path: string) => {
    if (path === "vue") return vue
    if (path === "@dcloudio/uni-app") return { onLoad: vi.fn(), onShow: vi.fn(), onHide: vi.fn(), onUnload: vi.fn(), onShareAppMessage: vi.fn() }
    if (path.endsWith("notification-api")) return { createNotificationApi: () => api }
    if (path.endsWith("wechat-token")) return { getWechatSessionPhoneVerified: () => true, getWechatSessionToken: () => "same-session" }
    if (path.endsWith("/api")) return { createMiniappApi: () => ({ listOrders: async () => [] }) }
    if (path.endsWith("page-helpers")) return { readableError: (_cause: unknown, fallback: string) => fallback }
    return {}
  } })
  if (exports.default === undefined) throw new Error("Page did not compile")
  return exports.default.setup({}, { expose: vi.fn() })
}

describe("recipient invitation state and dates", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })
  it.each(["recipient-invite", "trip-contact"] as const)("shows Beijing date and time from a UTC host in %s", name => {
    vi.stubEnv("TZ", "UTC")
    expect(setup(name).formatDate("2027-01-31T23:00:00.000Z")).toBe("2027/2/1 07:00:00")
  })
  it("removes the subscription success message when the recipient withdraws", async () => {
    const page = setup("recipient-invite")
    page.authorizationId.value = "recipient"
    page.message.value = "已同意接收一次行前提醒。"
    await page.withdraw()
    expect(api.withdrawRecipient).toHaveBeenCalledWith("recipient")
    expect(page.detail.value?.status).toBe("revoked")
    expect(page.message.value).toBe("")
  })
})
