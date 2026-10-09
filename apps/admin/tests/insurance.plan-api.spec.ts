// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { getSessionInsurancePlan, saveSessionInsurancePlan } from "@/api/insurance"

const plan = { insurerName: "保险公司", planName: "研学保障", coverageSummary: "正式保障内容", notice: null }
afterEach(() => vi.unstubAllGlobals())

describe("trip insurance plan API", () => {
  it("sends an authenticated plan update to the selected encoded trip", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ tourSessionId: "trip/a", plan })))
    vi.stubGlobal("fetch", fetchMock)
    expect((await saveSessionInsurancePlan("trip/a", plan)).plan).toEqual(plan)
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/insurance/sessions/trip%2Fa/plan"), expect.objectContaining({
      method: "PUT", credentials: "include", body: JSON.stringify({ plan }),
    }))
  })

  it("rejects a response for a different trip on read and save", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({ tourSessionId: "trip-b", plan }))))
    await expect(getSessionInsurancePlan("trip-a")).rejects.toThrow("所属团期不一致")
    await expect(saveSessionInsurancePlan("trip-a", plan)).rejects.toThrow("所属团期不一致")
  })

  it("preserves a denied save as an error rather than an unconfigured plan", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "缺少保险操作权限" }), { status: 403 })))
    await expect(saveSessionInsurancePlan("trip-a", null)).rejects.toThrow("缺少保险操作权限")
  })
})
