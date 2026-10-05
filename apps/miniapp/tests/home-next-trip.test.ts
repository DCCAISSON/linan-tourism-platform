import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { compileScript, parse } from "vue/compiler-sfc"
import { ModuleKind, transpileModule } from "typescript"
import * as vue from "vue"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "../src/api-error"
import type { OrderHistoryItem, TourSession } from "../src/api-types"

type HomePage = {
  readonly nextOrder: vue.Ref<OrderHistoryItem | null>
  readonly nextTripState: vue.Ref<string>
  readonly nextTripError: vue.Ref<string>
  readonly gatheringError: vue.Ref<string>
  readonly loadNextTrip: () => Promise<void>
  readonly openNextTrip: () => void
  readonly formatTripDate: (iso: string) => string
}
let token: string | undefined
let profileComplete = true
const navigate = vi.fn()
const api = {
  listOrders: vi.fn<() => Promise<readonly OrderHistoryItem[]>>(),
  listTourSessions: vi.fn<() => Promise<readonly Pick<TourSession, "id" | "status">[]>>(),
}
const getPretrip = vi.fn(async (_id: string) => ({ config: null }))
const source = readFileSync(new URL("../src/pages/index/index.vue", import.meta.url), "utf8")
const { descriptor } = parse(source)
function setup(): HomePage {
  const compiled = compileScript(descriptor, { id: "home-next-trip" })
  const code = transpileModule(compiled.content, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
  const exports: Record<string, unknown> = {}
  runInNewContext(code, { exports, Date, Error, uni: { navigateTo: navigate }, require: (name: string) => {
    if (name === "vue") return vue
    if (name === "@dcloudio/uni-app") return { onShow: vi.fn() }
    if (name.endsWith("/api")) return { ApiError, createMiniappApi: () => api }
    if (name.endsWith("pretrip-api")) return { createPretripApi: () => ({ getPretrip }) }
    if (name.endsWith("wechat-token")) return { getWechatSessionToken: () => token, getEnrollmentDraftOwner: () => "family:a" }
    if (name.endsWith("profile-display")) return { hasCompletedLocalProfile: () => profileComplete }
    if (name.endsWith("page-helpers")) return { readableError: (cause: unknown, fallback: string) => cause instanceof Error ? cause.message : fallback }
    if (name.endsWith("useActivityCatalog")) return { useActivityCatalog: () => ({ state: vue.ref("ready"), error: vue.ref(""), trips: vue.ref([]), load: vi.fn() }) }
    return {}
  } })
  const component = exports["default"]
  if (typeof component !== "object" || component === null || !("setup" in component) || typeof component.setup !== "function") throw new Error("Home setup missing")
  return component.setup({}, { expose: vi.fn() })
}
function order(id: string, startsAt = "2026-10-06T00:00:00.000Z", status: OrderHistoryItem["status"] = "paid"): OrderHistoryItem {
  return { id, code: id, enrollmentId: id, status, amountFen: 12800, paidFen: 12800, payerName: "家长", participantCount: 1, tourSessionId: id, activityTitle: id, schoolName: "学校", startsAt, endsAt: "2026-10-06T08:30:00.000Z", createdAt: "2026-10-01T00:00:00.000Z" }
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-10-05T03:00:00.000Z"))
  token = "family-a"
  profileComplete = true
  api.listOrders.mockResolvedValue([])
  api.listTourSessions.mockResolvedValue([])
  getPretrip.mockResolvedValue({ config: null })
})
afterEach(() => { vi.useRealTimers() })

describe("home next trip", () => {
  it.each(["guest", "incomplete"])("does not read family data when %s", async (state) => {
    if (state === "guest") token = undefined
    else profileComplete = false
    const page = setup()
    await page.loadNextTrip()
    expect(api.listOrders).not.toHaveBeenCalled()
    expect(page.nextOrder.value).toBeNull()
  })

  it("selects the earliest unfinished paid trip and opens its real pretrip route", async () => {
    api.listOrders.mockResolvedValue([order("later", "2026-10-06T07:00:00.000Z"), order("next & one"), order("pending", undefined, "pending_payment"), order("cancelled", undefined, "cancelled"), order("refund", undefined, "refunded"), { ...order("ended"), endsAt: "2026-10-04T08:30:00.000Z" }, order("cancelled-session", "2026-10-05T07:00:00.000Z")])
    api.listTourSessions.mockResolvedValue([...(["later", "next & one", "pending", "cancelled", "refund", "ended"].map(id => ({ id, status: "published" as const }))), { id: "cancelled-session", status: "cancelled" }])
    const page = setup()
    await page.loadNextTrip()
    page.openNextTrip()
    expect(page.nextOrder.value?.id).toBe("next & one")
    expect(getPretrip).toHaveBeenCalledWith("next & one")
    expect(navigate).toHaveBeenCalledWith({ url: "/pages/orders/pretrip?orderId=next%20%26%20one" })
  })

  it("keeps an ongoing paid trip after departure until its end", async () => {
    api.listOrders.mockResolvedValue([order("ongoing", "2026-10-05T00:00:00.000Z")])
    api.listTourSessions.mockResolvedValue([{ id: "ongoing", status: "closed" }])
    const page = setup()
    await page.loadNextTrip()
    expect(page.nextOrder.value?.id).toBe("ongoing")
  })

  it("formats dates in China rather than the device timezone", () => {
    expect(setup().formatTripDate("2026-10-05T16:30:00.000Z")).toBe("2026-10-06")
  })

  it("shows a retriable error rather than an empty trip when orders fail", async () => {
    api.listOrders.mockRejectedValueOnce(new Error("网络不可用"))
    const page = setup()
    await page.loadNextTrip()
    expect(page.nextTripState.value).toBe("error")
    expect(page.nextTripError.value).toBe("网络不可用")
    await page.loadNextTrip()
    expect(page.nextTripState.value).toBe("empty")
  })

  it("does not turn an unreadable session catalog into no upcoming trip", async () => {
    api.listTourSessions.mockRejectedValueOnce(new Error("团期加载失败"))
    const page = setup()
    await page.loadNextTrip()
    expect(page.nextTripState.value).toBe("error")
  })

  it("keeps login expiry visible as an error", async () => {
    api.listOrders.mockImplementationOnce(async () => { token = undefined; throw new ApiError(401, "登录已过期") })
    const page = setup()
    await page.loadNextTrip()
    expect(page.nextTripState.value).toBe("error")
    expect(page.nextTripError.value).toContain("登录")
  })

  it("does not display an old family's delayed response after logout", async () => {
    let finish: (orders: readonly OrderHistoryItem[]) => void = () => undefined
    api.listOrders.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    api.listTourSessions.mockResolvedValue([{ id: "old", status: "published" }])
    const page = setup()
    const pending = page.loadNextTrip()
    token = undefined
    await page.loadNextTrip()
    finish([order("old")])
    await pending
    expect(page.nextOrder.value).toBeNull()
    expect(getPretrip).not.toHaveBeenCalled()
  })

  it("preserves the trip and reports gathering failure separately", async () => {
    api.listOrders.mockResolvedValue([order("next")])
    api.listTourSessions.mockResolvedValue([{ id: "next", status: "published" }])
    getPretrip.mockRejectedValueOnce(new Error("集合信息加载失败"))
    const page = setup()
    await page.loadNextTrip()
    expect(page.nextTripState.value).toBe("ready")
    expect(page.nextOrder.value?.id).toBe("next")
    expect(page.gatheringError.value).toBe("集合信息加载失败")
  })
})
