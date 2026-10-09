import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MiniappRequestOptions } from "../src/api-types"
import { createGuideDailyApi, type PersonDailyInput } from "../src/guide-daily-api"
import { saveStaffSession } from "../src/staff-session"

const report = { id: "daily1", tourSessionId: "s1", personRef: "paid:p1", reportDate: "2026-10-09", version: 2, lodgingCheck: "", mealStatus: "", breakfast: null, lunch: "recorded", dinner: "not_applicable", breakfastNote: "", lunchNote: "按时用餐", dinnerNote: "返程不含晚餐", bodyStatus: "身体情况", note: "私人备注", healthReadable: true, publicSummary: "", publicApproved: false, updatedAt: "2026-10-09T08:00:00Z" }
const payload: PersonDailyInput = { reportDate: "2026-10-09", expectedVersion: 2, correctionReason: "更正餐次", breakfast: null, lunch: "recorded", dinner: "not_applicable", breakfastNote: "", lunchNote: "按时用餐", dinnerNote: "返程不含晚餐", bodyStatus: "身体情况", note: "私人备注" }
beforeEach(() => {
  const storage = new Map<string, unknown>()
  vi.stubGlobal("uni", { getStorageSync: (key: string) => storage.get(key), setStorageSync: (key: string, value: unknown) => storage.set(key, value), removeStorageSync: (key: string) => storage.delete(key) })
  saveStaffSession({ token: "staff-daily", expiresAt: "2099-01-01T00:00:00Z", account: { id: "g1", username: "guide", displayName: "导游", forcePasswordChange: false } })
})
afterEach(() => vi.unstubAllGlobals())
function setup(data: unknown) {
  const requests: MiniappRequestOptions[] = []
  const api = createGuideDailyApi({ baseUrl: "https://api.example.test", request: async options => { requests.push(options); return { statusCode: 200, data } } })
  return { api, requests }
}

describe("guide participant daily API", () => {
  it("preserves three meal states and uses Staff auth when listing reports", async () => {
    const { api, requests } = setup([report])
    const rows = await api.list("s1")
    expect(rows).toEqual([report])
    expect(requests[0]).toMatchObject({ url: "https://api.example.test/staff/execution/sessions/s1/person-daily-reports", header: { Authorization: "Staff staff-daily" } })
  })
  it("discards health text when the response denies health reading", async () => {
    const { api } = setup([{ ...report, healthReadable: false }])
    const rows = await api.list("s1")
    expect(rows[0]).toMatchObject({ bodyStatus: "", note: "", healthReadable: false })
  })
  it("posts the exact version and correction contract for an encoded participant", async () => {
    const { api, requests } = setup(report)
    await api.save("tour/a", "imported:child/a", payload)
    expect(requests[0]).toMatchObject({ url: "https://api.example.test/staff/execution/sessions/tour%2Fa/people/imported%3Achild%2Fa/daily-reports", method: "POST", data: payload })
  })
  it("drops all health fields from history even when the server includes them", async () => {
    const { api, requests } = setup([{ ...report, reportId: "daily1", recordedBy: "g1", recordedByName: "王导游", correctionReason: "更正餐次", createdAt: report.updatedAt, encryptedBodyStatus: "cipher" }])
    const history = await api.history("s1", "daily1")
    expect(history[0]).toMatchObject({ version: 2, recordedByName: "王导游", correctionReason: "更正餐次", lunch: "recorded" })
    expect(history[0]).not.toHaveProperty("bodyStatus")
    expect(history[0]).not.toHaveProperty("note")
    expect(history[0]).not.toHaveProperty("encryptedBodyStatus")
    expect(requests[0]?.url).toContain("/person-daily-reports/daily1/history")
  })
  it("approves a public summary with the report version", async () => {
    const { api, requests } = setup(report)
    await api.approve("s1", { id: "daily1", version: 2 }, "当天课程顺利完成")
    expect(requests[0]).toMatchObject({ url: "https://api.example.test/staff/execution/sessions/s1/person-daily-reports/daily1/public-summary", method: "POST", data: { expectedVersion: 2, publicSummary: "当天课程顺利完成" } })
  })
  it("rejects invalid meal values instead of converting them to unrecorded", async () => {
    const { api } = setup([{ ...report, breakfast: "absent" }])
    await expect(api.list("s1")).rejects.toThrow()
  })
})
