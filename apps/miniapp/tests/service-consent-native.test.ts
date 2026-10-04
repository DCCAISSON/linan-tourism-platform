import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { compileScript, parse } from "vue/compiler-sfc"
import { ModuleKind, transpileModule } from "typescript"
import * as vue from "vue"
import { beforeEach, describe, expect, it, vi } from "vitest"

type Consent = { readonly accept: () => void; readonly decline: () => void; readonly error: vue.Ref<string> }
type Authorization = { readonly success: () => void; readonly fail: () => void }
const accepted = vi.fn(), declined = vi.fn(), emit = vi.fn()
let authorization: Authorization | undefined
const requirePrivacyAuthorize = vi.fn((options: Authorization) => { authorization = options })

function setup(nativeAvailable = true): Consent {
  const source = readFileSync(new URL("../src/components/ServiceConsent.vue", import.meta.url), "utf8")
  const { descriptor } = parse(source)
  const compiled = compileScript(descriptor, { id: "service-consent-native" })
  const code = transpileModule(compiled.content, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
  const exports: { default?: { setup: (props: object, context: object) => Consent } } = {}
  runInNewContext(code, { exports, Error, ...(nativeAvailable ? { wx: { requirePrivacyAuthorize } } : {}), require: (name: string) => {
    if (name === "vue") return vue
    if (name === "@dcloudio/uni-app") return { onShow: vi.fn() }
    if (name.endsWith("service-consent")) return { acceptServiceConsent: accepted, declineServiceConsent: declined, hasSeenServiceConsent: () => false, hasServiceConsent: () => false }
    return {}
  } })
  if (exports.default === undefined) throw new Error("Missing service consent")
  return exports.default.setup({ required: false }, { expose: vi.fn(), emit })
}

beforeEach(() => { vi.clearAllMocks(); authorization = undefined })
describe("native privacy consent", () => {
  it("records agreement only after WeChat confirms native authorization", () => {
    const consent = setup()
    consent.accept()
    expect(requirePrivacyAuthorize).toHaveBeenCalledOnce()
    expect(accepted).not.toHaveBeenCalled()
    authorization?.success()
    expect(accepted).toHaveBeenCalledOnce()
    expect(emit).toHaveBeenCalledWith("accepted")
  })
  it("does not treat refusal as consent and still permits browsing", () => {
    const consent = setup()
    consent.accept()
    authorization?.fail()
    expect(accepted).not.toHaveBeenCalled()
    consent.decline()
    expect(declined).toHaveBeenCalledOnce()
    expect(emit).toHaveBeenCalledWith("declined")
  })
  it("does not fake native consent when WeChat is unavailable", () => {
    const consent = setup(false)
    consent.accept()
    expect(accepted).not.toHaveBeenCalled()
    expect(consent.error.value).toContain("微信")
    consent.decline()
    expect(declined).toHaveBeenCalledOnce()
  })
})
