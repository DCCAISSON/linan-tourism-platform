import { afterEach, describe, expect, it, vi } from "vitest"
import { useCatalogSessions } from "../src/views/configuration/useCatalogSessions"
import { parseTourSession } from "../src/api/configuration.parsers"
afterEach(() => vi.unstubAllGlobals())
describe("save enrollment scope", () => {
  it("uses independent PUT and refreshes session scope after saving", async () => {
    const enrollmentScope = [{ gradeId: "grade", classIds: ["class"] }]
    const request = vi.fn(async () => new Response(JSON.stringify({ id: "session", enrollmentScope }), { status: 200 }))
    vi.stubGlobal("fetch", request)
    const state = useCatalogSessions()
    state.tourSessions.value = [parseTourSession({ id: "session" })]
    await state.updateSession({ id: "session", payload: { enrollmentScope } })
    expect(request).toHaveBeenCalledWith(expect.stringContaining("/configuration/tour-sessions/session/enrollment-scope"), expect.objectContaining({ method: "PUT", body: JSON.stringify({ enrollmentScope }) }))
    expect(state.tourSessions.value[0]?.enrollmentScope).toEqual(enrollmentScope)
  })
  it("retains prior sessions and reports save failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "保存失败" }), { status: 500 })))
    const state = useCatalogSessions()
    const session = parseTourSession({ id: "session", enrollmentScope: [{ gradeId: "grade", classIds: null }] })
    state.tourSessions.value = [session]
    await state.updateSession({ id: "session", payload: { enrollmentScope: null } })
    expect(state.tourSessions.value).toEqual([session])
    expect(state.sessionFormError.value).toBe("保存失败")
    expect(state.sessionSubmitting.value).toBe(false)
  })
})
