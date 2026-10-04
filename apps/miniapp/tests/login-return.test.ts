import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { compileScript, parse } from "vue/compiler-sfc"
import { ModuleKind, transpileModule } from "typescript"
import * as vue from "vue"
import { renderToString } from "vue/server-renderer"
import { expect, it, vi } from "vitest"

it.each([false, true])("never renders the obsolete login choices while startup navigation is pending (loaded: %s)", async (loaded) => {
  const { descriptor } = parse(readFileSync(new URL("../src/pages/login/index.vue", import.meta.url), "utf8"))
  const code = transpileModule(compileScript(descriptor, {
    id: "login-render", inlineTemplate: true,
    templateOptions: { compilerOptions: { isCustomElement: (tag) => ["view", "text"].includes(tag) } },
  }).content, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
  const exports: Record<string, unknown> = {}
  const switchTab = vi.fn()
  runInNewContext(code, { exports, getCurrentPages: () => [{}], uni: { switchTab }, require: (name: string) => {
    if (name === "vue") return vue
    if (name === "@dcloudio/uni-app") return { onLoad: (callback: (query: object) => void) => { if (loaded) callback({}) } }
    return { default: vue.defineComponent({ render: () => vue.h("section", "确认登录身份") }) }
  } })
  const html = await renderToString(vue.createSSRApp(exports["default"] as vue.Component))
  expect(html).not.toContain("登录/注册")
  expect(html).not.toContain("先逛逛")
  expect(html).not.toContain("确认登录身份")
  expect(switchTab).toHaveBeenCalledTimes(loaded ? 1 : 0)
})

function setup(pageCount: number) {
  const { descriptor } = parse(readFileSync(new URL("../src/pages/login/index.vue", import.meta.url), "utf8"))
  const code = transpileModule(compileScript(descriptor, { id: "login" }).content, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
  const exports: Record<string, unknown> = {}
  const switchTab = vi.fn(), redirectTo = vi.fn()
  let load: ((query: Record<string, string>) => void) | undefined
  runInNewContext(code, { exports, getCurrentPages: () => Array.from({ length: pageCount }, () => ({})), uni: { switchTab, redirectTo }, require: (name: string) => {
    if (name === "vue") return vue
    if (name === "@dcloudio/uni-app") return { onLoad: (callback: typeof load) => { load = callback } }
    return {}
  } })
  const page = (exports["default"] as { setup: (props: object, context: object) => { sheetVisible: vue.Ref<boolean>; continueAfterLogin: () => void } }).setup({}, { expose: vi.fn() })
  return { page, switchTab, redirectTo, load: (query: Record<string, string>) => load?.(query) }
}

it.each([{}, { returnTo: encodeURIComponent("/pages/orders/index") }])("opens the home page without requesting login when launched directly with %s", (query) => {
  // Given a login link opened as the app's only page.
  const { page, switchTab, redirectTo, load } = setup(1)
  // When the link loads, regardless of saved privacy consent.
  load(query)
  // Then browsing starts on home and no profile sheet is opened.
  expect(switchTab).toHaveBeenCalledWith({ url: "/pages/index/index" })
  expect(redirectTo).not.toHaveBeenCalled()
  expect(page.sheetVisible.value).toBe(false)
})

it.each([{}, { returnTo: "/pages/index/index" }])("returns to browsing for an internal login route without a supported destination: %s", (query) => {
  const { page, switchTab, load } = setup(2)
  load(query)
  expect(page.sheetVisible.value).toBe(false)
  expect(switchTab).toHaveBeenCalledWith({ url: "/pages/index/index" })
})

it.each(["/pages/notifications/index", encodeURIComponent("/pages/notifications/index"), "/pages/orders/index", "/pages/settings/index", "/pages/family/index"])("returns to the intended page after login from %s", (target) => {
  const { page, switchTab, redirectTo, load } = setup(2)
  expect(page.sheetVisible.value).toBe(false)
  load({ returnTo: target })
  expect(page.sheetVisible.value).toBe(true)
  expect(switchTab).not.toHaveBeenCalled()
  page.continueAfterLogin()
  if (target.includes("notifications") || target.includes("settings")) expect(redirectTo).toHaveBeenCalledWith({ url: decodeURIComponent(target) })
  else expect(switchTab).toHaveBeenCalledWith({ url: target })
})
