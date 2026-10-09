import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MiniappRequestOptions } from "../src/api-types"
import { createGuideApi, type OccurrenceInput } from "../src/guide-execution-api"
import { saveStaffSession } from "../src/staff-session"

const summary = { id: "s1", code: "QYX-01", startsAt: "2026-10-09T00:00:00Z", endsAt: "2026-10-10T12:00:00Z", vehicleIds: ["v1"] }
const payload: OccurrenceInput = { personRef: "imported:child/a", reportDate: "2026-10-09", type: "lunch", label: "午餐", nodeId: "node1", occurredAt: "2026-10-09T04:00:00.000Z", status: "recorded", location: "餐厅", note: "实际用餐情况", correctsId: "occ1", correctionReason: "原备注有误", expectedVersion: 2 }
beforeEach(() => {
  const storage = new Map<string, unknown>()
  vi.stubGlobal("uni", { getStorageSync: (key: string) => storage.get(key), setStorageSync: (key: string, value: unknown) => storage.set(key, value), removeStorageSync: (key: string) => storage.delete(key) })
  saveStaffSession({ token: "staff-fixture", expiresAt: "2099-01-01T00:00:00Z", account: { id: "g1", username: "guide", displayName: "导游", forcePasswordChange: false } })
})
afterEach(() => vi.unstubAllGlobals())
function setup(data: unknown) {
  const requests: MiniappRequestOptions[] = []
  const api = createGuideApi({ baseUrl: "https://api.example.test/", request: async options => { requests.push(options); return { statusCode: 200, data } } })
  return { api, requests }
}

describe("guide execution API", () => {
  it("uses staff auth and preserves assigned session summaries", async () => {
    // Given
    const { api, requests } = setup([summary])
    // When
    const result = await api.listSessions()
    // Then
    expect(result).toEqual([summary])
    expect(requests).toEqual([{ url: "https://api.example.test/staff/execution/sessions", method: "GET", header: { Authorization: "Staff staff-fixture" } }])
  })
  it("parses own and read-only rosters without retaining health or aggregate attendance", async () => {
    // Given
    const person = { personRef: "paid:p1", displayName: "张同学", className: null, vehicleId: "v1", active: true, inactiveReason: null, healthAuthorized: true, health: { allergies: "private" }, attendance: { note: "private" } }
    const { api, requests } = setup({ ...summary, confirmationStatus: "current", vehicles: [{ id: "v1", sequence: 1, plateNumber: "" }], people: [person], groupPeople: [{ ...person, vehicleSequence: 1 }], dailyReports: [{ bodyStatus: "private" }], events: [{ id: "health1", category: "health", content: "private" }, { id: "e1", category: "objective", personRef: "paid:p1", occurredAt: "2026-10-09T01:00:00Z", content: "抵达营地", publicSummary: "" }] })
    // When
    const result = await api.getSession("tour/a")
    // Then
    expect(requests[0]?.url).toBe("https://api.example.test/staff/execution/sessions/tour%2Fa")
    expect(result.people[0]).not.toHaveProperty("health")
    expect(result.people[0]).not.toHaveProperty("attendance")
    expect(result).not.toHaveProperty("dailyReports")
    expect(result.events).toHaveLength(1)
    expect(result.events[0]?.content).toBe("抵达营地")
  })
  it("retains node versions and the append-only correction chain", async () => {
    // Given
    const record = { ...payload, id: "occ2", rootId: "occ1", nodeVersion: 3, version: 3, recordedByName: "王导游", createdAt: "2026-10-09T04:10:00Z" }
    const data = { nodes: [{ id: "node1", type: "lunch", label: "午餐", reportDate: "2026-10-09", scheduledTime: "12:00", active: true, version: 3 }], records: [record], progress: [{ nodeId: "node1", expected: 1, completed: 1, missingPeople: [], absentPeople: [] }] }
    const { api } = setup(data)
    // When
    const result = await api.getNodes("s1")
    // Then
    expect(result.records[0]).toMatchObject({ nodeVersion: 3, version: 3, correctsId: "occ1", correctionReason: "原备注有误" })
    expect(result.progress).toEqual(data.progress)
  })
  it("posts the original correction target and expectedVersion unchanged", async () => {
    // Given
    const { api, requests } = setup({ id: "occ3" })
    // When
    await api.saveOccurrence("tour/a", payload)
    // Then
    expect(requests[0]).toEqual({ url: "https://api.example.test/staff/execution/sessions/tour%2Fa/occurrences", method: "POST", header: { Authorization: "Staff staff-fixture", "Content-Type": "application/json" }, data: payload })
  })
  it("posts a person-scoped event to the existing endpoint", async () => {
    // Given
    const { api, requests } = setup({ id: "evt1" })
    const event = { personRef: "paid:p1", category: "safety", occurredAt: "2026-10-09T01:00:00Z", content: "已联系带队老师处理。" } as const
    // When
    await api.createEvent("s1", event)
    // Then
    expect(requests[0]?.url).toBe("https://api.example.test/staff/execution/sessions/s1/events")
    expect(requests[0]?.data).toEqual(event)
  })
  it("rejects malformed node records instead of showing empty success", async () => {
    // Given
    const { api } = setup({ nodes: [], records: [{ ...payload, status: "present" }], progress: [] })
    // When / Then
    await expect(api.getNodes("s1")).rejects.toThrow("执行记录暂时无法读取")
  })
})
