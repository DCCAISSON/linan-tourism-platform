import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { compileScript, parse } from "vue/compiler-sfc"
import { ModuleKind, transpileModule } from "typescript"
import * as vue from "vue"
import { expect, it, vi } from "vitest"

type BookingProduct = { bookingUrl: string; bookingAuthorized: boolean; customerServicePhone: string }
function setup(getProduct: (id: string) => Promise<BookingProduct>) {
  const { descriptor } = parse(readFileSync(new URL("../src/pages/business/booking.vue", import.meta.url), "utf8"))
  const code = transpileModule(compileScript(descriptor, { id: "booking" }).content, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
  const exports: Record<string, unknown> = {}
  let onLoad: ((query: Record<string, string>) => void) | undefined
  let onHide: (() => void) | undefined
  runInNewContext(code, { exports, require: (name: string) => {
    if (name === "vue") return vue
    if (name === "@dcloudio/uni-app") return { onLoad: (callback: typeof onLoad) => { onLoad = callback }, onShow: vi.fn(), onHide: (callback: typeof onHide) => { onHide = callback } }
    if (name === "../../business-api") return { createBusinessApi: () => ({ getProduct }) }
    return { readableError: (cause: Error) => cause.message }
  } })
  const page = (exports["default"] as { setup: (props: object, context: object) => { bookingUrl: vue.Ref<string>; error: vue.Ref<string>; load: () => Promise<void>; bookingFailed: () => void } }).setup({}, { expose: vi.fn() })
  return { page, query: (query: Record<string, string>) => onLoad?.(query), hide: () => onHide?.() }
}

const product = { bookingUrl: "https://booking.example.com/rooms", bookingAuthorized: true, customerServicePhone: "057163800000" }

it("ignores query URLs and reads the current published product", async () => {
  const getProduct = vi.fn(async () => product)
  const { page, query } = setup(getProduct)
  query({ id: "product-1", url: "https://untrusted.example.com" })
  await page.load()
  expect(getProduct).toHaveBeenCalledWith("product-1")
  expect(page.bookingUrl.value).toBe(product.bookingUrl)
  page.bookingFailed()
  expect(page.bookingUrl.value).toBe("")
  expect(page.error.value).toContain("联系工作人员")
})

it.each([{ ...product, bookingAuthorized: false }, { ...product, bookingUrl: "http://booking.example.com" }])("does not open revoked or insecure entries", async (result) => {
  const { page, query } = setup(async () => result)
  query({ id: "product-1" })
  await page.load()
  expect(page.bookingUrl.value).toBe("")
  expect(page.error.value).toContain("暂未开放")
})

it("does not restore an entry after the page is hidden and rechecks on return", async () => {
  let resolveProduct: ((value: BookingProduct) => void) | undefined
  const getProduct = vi.fn(() => new Promise<BookingProduct>((resolve) => { resolveProduct = resolve }))
  const { page, query, hide } = setup(getProduct)
  query({ id: "product-1" })
  const pending = page.load()
  hide()
  resolveProduct?.(product)
  await pending
  expect(page.bookingUrl.value).toBe("")
  getProduct.mockResolvedValue({ ...product, bookingAuthorized: false })
  await page.load()
  expect(getProduct).toHaveBeenCalledTimes(2)
  expect(page.bookingUrl.value).toBe("")
})

it("shows a recovery message when the product is unpublished or unavailable", async () => {
  const { page, query } = setup(async () => { throw new Error("服务已下架") })
  query({ id: "product-1" })
  await page.load()
  expect(page.bookingUrl.value).toBe("")
  expect(page.error.value).toBe("服务已下架")
})
