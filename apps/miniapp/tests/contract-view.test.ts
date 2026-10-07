import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { compileScript, parse } from "vue/compiler-sfc"
import { ModuleKind, transpileModule } from "typescript"
import * as vue from "vue"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useContractPage } from "../src/pages/orders/useContractPage"
import type { OrderContract, SignContractInput } from "../src/contract-types"
import { handwriting, pendingContract, signedContract } from "./contract-fixture"

const calls = vi.hoisted(() => ({ getContract: vi.fn<() => Promise<OrderContract | null>>(), signContract: vi.fn<(id: string, input: SignContractInput) => Promise<OrderContract | null>>(), hide: () => {} }))
vi.mock("../src/contract-api", () => ({ createContractApi: () => calls }))
vi.mock("../src/wechat-token", () => ({ getWechatSessionToken: () => "owner-a", getEnrollmentDraftOwner: () => "family:a" }))
vi.mock("@dcloudio/uni-app", () => ({ onLoad: () => {}, onShow: () => {}, onUnload: () => {}, onHide: (callback: () => void) => { calls.hide = callback } }))

type ContractView = ReturnType<typeof useContractPage> & {
  readonly activeView: vue.Ref<"reading" | "signing">
  readonly readerScrollTop: vue.Ref<number>
  readonly selectView: (view: "reading" | "signing") => void
  readonly rememberReadingPosition: (event: { readonly detail: { readonly scrollTop: number } }) => void
}
const source = readFileSync(new URL("../src/pages/orders/contract.vue", import.meta.url), "utf8")
const { descriptor } = parse(source)
const scopes: vue.EffectScope[] = []

async function setup(): Promise<ContractView> {
  const code = transpileModule(compileScript(descriptor, { id: "contract-view" }).content, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
  const exports: { default?: { setup: (props: object, context: object) => ContractView } } = {}
  const state = useContractPage()
  state.orderId.value = "order-1"
  await state.load()
  runInNewContext(code, { exports, require: (name: string) => {
    if (name === "vue") return vue
    if (name === "./useContractPage") return { useContractPage: () => state }
    return {}
  } })
  const component = exports.default
  if (!component) throw new Error("Missing contract view")
  const scope = vue.effectScope()
  scopes.push(scope)
  const page = scope.run(() => component.setup({}, { expose: vi.fn() }))
  if (!page) throw new Error("Contract view did not initialize")
  return page
}

beforeEach(() => { calls.getContract.mockReset().mockResolvedValue(pendingContract); calls.signContract.mockReset().mockResolvedValue(signedContract) })
afterEach(() => { for (const scope of scopes) scope.stop(); scopes.length = 0 })

describe("contract reading and signing views", () => {
  it("opens signing without agreeing or submitting and restores the reading position", async () => {
    const page = await setup()
    expect(page.activeView.value).toBe("reading")
    page.rememberReadingPosition({ detail: { scrollTop: 864 } })
    page.selectView("signing")
    expect(page.activeView.value).toBe("signing")
    expect(page.agreed.value).toBe(false)
    expect(page.canSign.value).toBe(false)
    expect(calls.signContract).not.toHaveBeenCalled()
    page.selectView("reading")
    expect(page.readerScrollTop.value).toBe(864)
    expect(page.contract.value?.template.bodyText).toBe(pendingContract.template.bodyText)
    expect(descriptor.template?.content).toContain(':scroll-top="readerScrollTop"')
    expect(descriptor.template?.content).toContain('@scroll="rememberReadingPosition"')
  })

  it("keeps the same order's handwriting, name and explicit agreement across view changes", async () => {
    const page = await setup()
    page.selectView("signing")
    page.signerName.value = "李女士"; page.signature.value = handwriting; page.agreed.value = true
    page.selectView("reading"); page.selectView("signing")
    expect(page.signerName.value).toBe("李女士")
    expect(page.signature.value).toEqual(handwriting)
    expect(page.agreed.value).toBe(true)
    expect(page.canSign.value).toBe(true)
    expect(calls.signContract).not.toHaveBeenCalled()
  })

  it("returns to reading and clears its position when the existing lifecycle discards the contract", async () => {
    const page = await setup()
    page.rememberReadingPosition({ detail: { scrollTop: 864 } }); page.selectView("signing")
    page.signerName.value = "李女士"; page.signature.value = handwriting; page.agreed.value = true
    calls.hide()
    await vue.nextTick()
    expect(page.activeView.value).toBe("reading")
    expect(page.readerScrollTop.value).toBe(0)
    expect(page.signature.value).toBeNull()
    expect(page.agreed.value).toBe(false)
  })

  it("keeps the success record in the signing view without resetting its reading position", async () => {
    const page = await setup()
    page.rememberReadingPosition({ detail: { scrollTop: 864 } }); page.selectView("signing")
    page.signerName.value = "李女士"; page.signature.value = handwriting; page.agreed.value = true
    await page.sign(); await vue.nextTick()
    expect(page.activeView.value).toBe("signing")
    expect(page.signed.value).toBe(true)
    expect(page.readerScrollTop.value).toBe(864)
    expect(page.contract.value?.signature).toEqual(handwriting)
  })
})
