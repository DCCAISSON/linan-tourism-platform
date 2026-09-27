import { describe, expect, it } from "vitest"
import type { MiniappRequestOptions } from "../src/api-types"
import { createExecutionHealthClient } from "../src/execution-health-api"

describe("family execution and health API", () => {
  it("retains the approved person/date summary and excludes private report fields", async () => {
    const api = createExecutionHealthClient({ request: async () => ({ statusCode: 200, data: { tourSessionId: "tour-a", dailyReports: [], events: [], personDailyReports: [{ personRef: "paid:line-a", displayName: "小明", reportDate: "2026-09-27", publicSummary: "已用餐", note: "private", bodyStatus: "private" }] } }) })
    await expect(api.publicSummary("order-a")).resolves.toEqual({ tourSessionId: "tour-a", dailyReports: [], events: [], personDailyReports: [{ personRef: "paid:line-a", displayName: "小明", reportDate: "2026-09-27", publicSummary: "已用餐" }] })
  })
  it("uses the WeChat session for family execution requests", async () => {
    const requests: MiniappRequestOptions[] = []
    const api = createExecutionHealthClient({
      baseUrl: "https://api.example.test",
      familyIdentityHeader: "family-a",
      wechatSessionToken: "session-a",
      request: async (options) => {
        requests.push(options)
        return { statusCode: 200, data: { tourSessionId: "tour-a", dailyReports: [], events: [] } }
      },
    })

    await expect(api.publicSummary("order/a")).resolves.toEqual({ tourSessionId: "tour-a", personDailyReports: [], dailyReports: [], events: [] })
    expect(requests).toEqual([{
      url: "https://api.example.test/orders/order%2Fa/execution/public-summary",
      method: "GET",
      header: { "x-linan-dev-family-identity": "family-a", Authorization: "Bearer session-a" },
    }])
  })
})
