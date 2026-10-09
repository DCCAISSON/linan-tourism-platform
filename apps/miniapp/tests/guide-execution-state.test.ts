import { describe, expect, it, vi } from "vitest"
import { ApiError } from "../src/api-error"
import type { ExecutionOccurrence, GuideApi, GuideSession, NodeData, OccurrenceInput } from "../src/guide-execution-api"
import { useGuideExecution } from "../src/guide-execution-state"

const person = { personRef: "paid:p1", displayName: "张同学", className: "一班", active: true, inactiveReason: null, vehicleId: "v1", healthAuthorized: false } as const
const session: GuideSession = { id: "s1", code: "QYX-01", startsAt: "2026-10-09T00:00:00Z", endsAt: "2026-10-10T12:00:00Z", vehicleIds: ["v1"], confirmationStatus: "current", vehicles: [{ id: "v1", sequence: 1, plateNumber: "浙A12345" }], people: [person], groupPeople: [ { ...person, vehicleSequence: 1 } ], events: [] }
const nodes: NodeData = { nodes: [], records: [], progress: [] }
const payload: OccurrenceInput = { personRef: "paid:p1", reportDate: "2026-10-09", type: "attendance", label: "出发", nodeId: null, occurredAt: "2026-10-09T00:00:00Z", status: "present", location: "", note: "", correctsId: null, correctionReason: "", expectedVersion: 0 }
const recorded: ExecutionOccurrence = { ...payload, id: "occ1", rootId: "occ1", nodeVersion: null, version: 2, recordedByName: "王导游", createdAt: "2026-10-09T00:02:00Z" }
function setup(overrides: Partial<GuideApi> = {}, permissions: readonly string[] = ["execution.read", "execution.write"]) {
  const api: GuideApi = { listSessions: async () => [session], getSession: async () => session, getNodes: async () => nodes, saveOccurrence: vi.fn(async () => {}), createEvent: vi.fn(async () => {}), ...overrides }
  let token: string | undefined = "token-a"
  const login = vi.fn()
  const page = useGuideExecution({ api, me: async () => ({ actorId: "guide", forcePasswordChange: false, permissionKeys: permissions }), token: () => token, login })
  return { ...page, api, login, setToken(value: string | undefined) { token = value } }
}
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("未初始化") }
  let reject: (error: unknown) => void = () => { throw new Error("未初始化") }
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

describe("guide execution page state", () => {
  it("does not allow writes when the transport confirmation is stale", async () => {
    // Given
    const page = setup({ getSession: async () => ({ ...session, confirmationStatus: "stale" }) })
    await page.load("s1")
    // When
    await page.saveOccurrence(payload)
    // Then
    expect(page.state.canWrite).toBe(false)
    expect(page.api.saveOccurrence).not.toHaveBeenCalled()
  })
  it("keeps another vehicle read-only even if returned in a malformed own roster", async () => {
    // Given
    const page = setup({ getSession: async () => ({ ...session, people: [{ ...person, vehicleId: "v2" }] }) })
    await page.load("s1")
    // When
    await page.saveOccurrence(payload)
    // Then
    expect(page.api.saveOccurrence).not.toHaveBeenCalled()
    expect(page.state.error).toContain("本人所带车辆")
  })
  it("keeps execution.read accounts read-only", async () => {
    // Given
    const page = setup({}, ["execution.read"])
    await page.load("s1")
    // When
    await page.saveOccurrence(payload)
    // Then
    expect(page.api.saveOccurrence).not.toHaveBeenCalled()
    expect(page.state.session?.people).toHaveLength(1)
  })
  it("ignores a late roster after the page is hidden", async () => {
    // Given
    const response = deferred<GuideSession>()
    const page = setup({ getSession: () => response.promise })
    const loading = page.load("s1")
    await Promise.resolve()
    // When
    page.clear()
    response.resolve(session)
    await loading
    // Then
    expect(page.state.session).toBeNull()
    expect(page.state.nodes).toBeNull()
    expect(page.state.loading).toBe(false)
  })
  it("ignores a late save result after changing sessions", async () => {
    // Given
    const response = deferred<void>()
    const page = setup({ saveOccurrence: () => response.promise, getSession: async id => ({ ...session, id }) })
    await page.load("s1")
    const saving = page.saveOccurrence(payload)
    await page.load("s2")
    // When
    response.resolve()
    await saving
    // Then
    expect(page.state.session?.id).toBe("s2")
    expect(page.state.notice).toBe("")
  })
  it("clears visible records and routes to login after current-session 401", async () => {
    // Given
    const page = setup({ saveOccurrence: async () => { page.setToken(undefined); throw new ApiError(401, "登录失效") } })
    await page.load("s1")
    // When
    await page.saveOccurrence(payload)
    // Then
    expect(page.state.session).toBeNull()
    expect(page.state.nodes).toBeNull()
    expect(page.login).toHaveBeenCalledOnce()
  })
  it("ignores old-account 401 after a new account is selected", async () => {
    // Given
    const response = deferred<void>()
    const page = setup({ saveOccurrence: () => response.promise })
    await page.load("s1")
    const saving = page.saveOccurrence(payload)
    page.setToken("token-b")
    await page.load("s2")
    // When
    response.reject(new ApiError(401, "旧账号失效"))
    await saving
    // Then
    expect(page.login).not.toHaveBeenCalled()
    expect(page.state.session).not.toBeNull()
  })
  it("clears roster and history when write access is removed", async () => {
    // Given
    const page = setup({ saveOccurrence: async () => { throw new ApiError(403, "分配已撤销") } })
    await page.load("s1")
    // When
    await page.saveOccurrence(payload)
    // Then
    expect(page.state.session).toBeNull()
    expect(page.state.nodes).toBeNull()
    expect(page.state.error).toContain("无权")
  })
  it("keeps data without reporting success when a save fails", async () => {
    // Given
    const page = setup({ saveOccurrence: async () => { throw new ApiError(0, "网络错误") } })
    await page.load("s1")
    // When
    await page.saveOccurrence(payload)
    // Then
    expect(page.state.session?.people).toHaveLength(1)
    expect(page.state.notice).toBe("")
    expect(page.state.error).toBe("网络错误")
    expect(page.state.saving).toBe(false)
  })
  it("posts a correction with the current version and refreshes the saved history", async () => {
    // Given
    const page = setup({ getNodes: async () => ({ ...nodes, records: [recorded] }) })
    await page.load("s1")
    const correction = { ...payload, correctsId: "occ1", expectedVersion: 2, correctionReason: "原状态选错", status: "absent" } as const
    // When
    await page.saveOccurrence(correction)
    // Then
    expect(page.api.saveOccurrence).toHaveBeenCalledWith("s1", correction)
    expect(page.state.notice).toBe("记录已保存。")
    expect(page.state.saving).toBe(false)
  })
  it("requires a reason before saving a correction", async () => {
    // Given
    const page = setup({ getNodes: async () => ({ ...nodes, records: [recorded] }) })
    await page.load("s1")
    // When
    await page.saveOccurrence({ ...payload, correctsId: "occ1", expectedVersion: 2 })
    // Then
    expect(page.api.saveOccurrence).not.toHaveBeenCalled()
    expect(page.state.error).toContain("更正原因")
  })
  it("does not overwrite an occurrence already corrected by another guide", async () => {
    // Given
    const page = setup({ getNodes: async () => ({ ...nodes, records: [recorded, { ...recorded, id: "occ2", correctsId: "occ1", version: 3 }] }) })
    await page.load("s1")
    // When
    await page.saveOccurrence({ ...payload, correctsId: "occ1", expectedVersion: 2, correctionReason: "修正状态" })
    // Then
    expect(page.api.saveOccurrence).not.toHaveBeenCalled()
    expect(page.state.error).toContain("已变化")
  })
  it("clears outdated content when the server reports a version conflict", async () => {
    // Given
    const page = setup({ saveOccurrence: async () => { throw new ApiError(409, "版本冲突") } })
    await page.load("s1")
    // When
    await page.saveOccurrence(payload)
    // Then
    expect(page.state.session).toBeNull()
    expect(page.state.nodes).toBeNull()
    expect(page.state.error).toContain("刷新")
  })
  it("clears roster when a refresh loses read permission", async () => {
    // Given
    const response = deferred<GuideSession>()
    const page = setup({ getSession: () => response.promise })
    const loading = page.load("s1")
    // When
    response.reject(new ApiError(403, "无权读取"))
    await loading
    // Then
    expect(page.state.session).toBeNull()
    expect(page.state.error).toContain("无权")
    expect(page.login).not.toHaveBeenCalled()
  })
  it("limits progress and history to assigned vehicles", async () => {
    // Given
    const page = setup({ getNodes: async () => ({ ...nodes, records: [recorded, { ...recorded, id: "foreign", personRef: "paid:foreign" }], progress: [{ nodeId: "n1", expected: 2, completed: 0, missingPeople: ["paid:p1", "paid:foreign"], absentPeople: ["paid:foreign"] }] }) })
    // When
    await page.load("s1")
    // Then
    expect(page.state.nodes?.records.map(row => row.id)).toEqual(["occ1"])
    expect(page.state.nodes?.progress[0]).toEqual({ nodeId: "n1", expected: 1, completed: 0, missingPeople: ["paid:p1"], absentPeople: [] })
  })
  it("retains confirmed inactive people as missing without allowing a write", async () => {
    // Given
    const page = setup({ getSession: async () => ({ ...session, people: [{ ...person, active: false, inactiveReason: "已取消" }] }), getNodes: async () => ({ ...nodes, progress: [{ nodeId: "n1", expected: 1, completed: 0, missingPeople: ["paid:p1"], absentPeople: [] }] }) })
    await page.load("s1")
    // When
    await page.saveOccurrence(payload)
    // Then
    expect(page.api.saveOccurrence).not.toHaveBeenCalled()
    expect(page.state.nodes?.progress[0]).toMatchObject({ expected: 1, completed: 0, missingPeople: ["paid:p1"] })
  })
  it("appends another unplanned occurrence without replacing its earlier record", async () => {
    // Given
    const page = setup({ getNodes: async () => ({ ...nodes, records: [recorded] }) })
    await page.load("s1")
    // When
    await page.saveOccurrence({ ...payload, label: "返程临时点名", occurredAt: "2026-10-09T08:00:00Z" })
    // Then
    expect(page.api.saveOccurrence).toHaveBeenCalledWith("s1", expect.objectContaining({ nodeId: null, correctsId: null, expectedVersion: 0, label: "返程临时点名" }))
    expect(page.state.nodes?.records[0]?.id).toBe("occ1")
  })
  it("does not show an old save success after hide and re-entry during refresh", async () => {
    // Given
    const refresh = deferred<GuideSession>()
    let requests = 0
    const page = setup({ getSession: async () => ++requests === 2 ? refresh.promise : session })
    await page.load("s1")
    const saving = page.saveOccurrence(payload)
    await Promise.resolve()
    await Promise.resolve()
    page.clear()
    await page.load("s1")
    // When
    refresh.resolve(session)
    await saving
    // Then
    expect(page.state.session?.id).toBe("s1")
    expect(page.state.notice).toBe("")
  })
  it("keeps a non-first date and node selected after saving for the next person", async () => {
    // Given
    const page = setup({ getSession: async () => ({ ...session, people: [person, { ...person, personRef: "paid:p2" }] }) })
    await page.load("s1")
    page.state.selection = { date: "2026-10-10", nodeId: "return-roll-call" }
    // When
    await page.saveOccurrence({ ...payload, reportDate: page.state.selection.date, nodeId: page.state.selection.nodeId, occurredAt: "2026-10-10T08:00:00Z" })
    // Then
    expect(page.state.selection).toEqual({ date: "2026-10-10", nodeId: "return-roll-call" })
    expect(page.state.session?.people[1]?.personRef).toBe("paid:p2")
    expect(page.state.saving).toBe(false)
  })
  it("clears the selected date and node together with roster on hide", async () => {
    // Given
    const page = setup()
    await page.load("s1")
    page.state.selection = { date: "2026-10-10", nodeId: "return-roll-call" }
    // When
    page.clear()
    // Then
    expect(page.state.selection).toBeNull()
    expect(page.state.session).toBeNull()
  })
})
