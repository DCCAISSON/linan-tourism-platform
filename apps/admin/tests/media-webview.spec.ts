import { createApp, nextTick } from "vue"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import MediaWebview from "../../miniapp/src/pages/webview/index.vue"

const lifecycle = vi.hoisted(() => ({
  load: (_query: Record<string, string>) => {},
  show: async () => {},
  hide: () => {},
  read: vi.fn(),
}))
vi.mock("../../miniapp/node_modules/@dcloudio/uni-app", () => ({
  onLoad: (callback: typeof lifecycle.load) => { lifecycle.load = callback },
  onShow: (callback: typeof lifecycle.show) => { lifecycle.show = callback },
  onHide: (callback: typeof lifecycle.hide) => { lifecycle.hide = callback },
}))
vi.mock("../../miniapp/src/album-api", () => ({ createAlbumApi: () => ({ getOrderAlbum: lifecycle.read }) }))

describe("order-scoped album webview", () => {
  beforeEach(() => { lifecycle.read.mockReset() })
  afterEach(() => document.body.replaceChildren())

  it("refuses arbitrary URL query parameters without reading or opening them", async () => {
    const app = mount()
    lifecycle.load({ url: "https://album.example.test/old" })
    await lifecycle.show()
    await nextTick()
    expect(lifecycle.read).not.toHaveBeenCalled()
    expect(document.querySelector("web-view")).toBeNull()
    expect(document.body.textContent).toContain("活动影像暂时无法打开，请返回订单后重试。")
    app.unmount()
  })

  it("clears the old webview and rereads permissions after returning to a disabled album", async () => {
    lifecycle.read.mockResolvedValueOnce({ providers: [{ kind: "album", url: "https://album.example.test/active" }] }).mockResolvedValueOnce({ providers: [] })
    const app = mount()
    lifecycle.load({ orderId: "own-order", kind: "album" })
    await lifecycle.show()
    await nextTick()
    expect(document.querySelector("web-view")?.getAttribute("src")).toBe("https://album.example.test/active")
    lifecycle.hide()
    await nextTick()
    expect(document.querySelector("web-view")).toBeNull()
    await lifecycle.show()
    await nextTick()
    expect(lifecycle.read).toHaveBeenCalledTimes(2)
    expect(document.querySelector("web-view")).toBeNull()
    expect(document.body.textContent).toContain("活动影像暂未开放，请返回订单查看其他信息。")
    app.unmount()
  })

  it("keeps the webview empty when the order access request is rejected", async () => {
    lifecycle.read.mockRejectedValue(new Error("无权访问本团素材"))
    const app = mount()
    lifecycle.load({ orderId: "other-order", kind: "album" })
    await lifecycle.show()
    await nextTick()
    expect(lifecycle.read).toHaveBeenCalledWith("other-order")
    expect(document.querySelector("web-view")).toBeNull()
    expect(document.body.textContent).toContain("无权访问")
    app.unmount()
  })
})

function mount() {
  const root = document.createElement("div")
  document.body.append(root)
  const app = createApp(MediaWebview)
  app.config.compilerOptions.isCustomElement = tag => tag === "web-view" || tag === "view"
  app.mount(root)
  return app
}
