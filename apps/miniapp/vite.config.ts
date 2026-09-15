import { defineConfig } from "vite"
import type { Plugin } from "vite"
import type { VitePluginUniOptions } from "@dcloudio/vite-plugin-uni"
import uniPluginModule from "@dcloudio/vite-plugin-uni"

type UniPluginFactory = (rawOptions?: VitePluginUniOptions) => Plugin[]
type UniPluginModule = UniPluginFactory | { readonly default: UniPluginFactory }

function resolveUniPlugin(module: UniPluginModule): UniPluginFactory {
  if (typeof module === "function") {
    return module
  }

  return module.default
}

const uni = resolveUniPlugin(uniPluginModule)

export default defineConfig({
  plugins: [uni()],
})
