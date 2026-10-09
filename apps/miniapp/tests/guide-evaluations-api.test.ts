import { beforeEach, describe, expect, it, vi } from "vitest"
import type { RequestTransport } from "../src/api-types"
import { createGuideEvaluationsApi, type EvaluationCreateInput, type EvaluationRow } from "../src/guide-evaluations-api"
import { saveStaffSession } from "../src/staff-session"

const storage = new Map<string, unknown>()
const request = vi.fn<RequestTransport>()
const api = createGuideEvaluationsApi({ baseUrl: "https://api.example.test", request })
const row: EvaluationRow = { id: "eval1", version: 2, personRef: "paid:p1", displayName: "张同学", organizationId: "org1", gradeName: "三年级", className: "一班", standardId: "std1", gradeCode: "B", gradeLabel: "合格", internalComment: "认真观察", excellent: false, attention: true, confirmedAt: null, dimensionObservations: [] }
const observation = { personRef: row.personRef, gradeCode: row.gradeCode, internalComment: row.internalComment, excellent: row.excellent, attention: row.attention, dimensionObservations: row.dimensionObservations }
const input: EvaluationCreateInput = { tourSessionId: "s1", standardId: "std1", idempotencyKey: "guide-save-1", observations: [observation] }
beforeEach(() => {
  storage.clear(); request.mockReset()
  vi.stubGlobal("uni", { getStorageSync: (key: string) => storage.get(key), setStorageSync: (key: string, value: unknown) => storage.set(key, value), removeStorageSync: (key: string) => storage.delete(key) })
  saveStaffSession({ token: "staff-a", expiresAt: "2099-01-01T00:00:00Z", account: { id: "guide-a", username: "guide-a", displayName: "导游甲", forcePasswordChange: false } })
})

describe("guide evaluations API", () => {
  it("saves one manual observation through the existing endpoint using Staff authentication", async () => {
    request.mockResolvedValue({ statusCode: 201, data: [row] })
    const result = await api.create(input)
    expect(result).toEqual(row)
    expect(request).toHaveBeenCalledWith({ url: "https://api.example.test/evaluations/staff/batch", method: "POST", header: { Authorization: "Staff staff-a", "Content-Type": "application/json" }, data: input })
  })
  it("revises existing evaluations with their original version", async () => {
    request.mockResolvedValue({ statusCode: 201, data: { ...row, version: 3 } })
    const { personRef: _personRef, ...revision } = observation
    await api.revise(row, revision)
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ url: "https://api.example.test/evaluations/staff/eval1", data: { ...revision, expectedVersion: 2 } }))
  })
  it.each([undefined, {}, [], [{ ...row, personRef: "paid:another" }]])("rejects an absent or mismatched save receipt", async data => {
    request.mockResolvedValue({ statusCode: 201, data })
    await expect(api.create(input)).rejects.toMatchObject({ statusCode: 0 })
  })
  it("rejects stale revise receipts", async () => {
    request.mockResolvedValue({ statusCode: 201, data: row })
    const { personRef: _personRef, ...revision } = observation
    await expect(api.revise(row, revision)).rejects.toMatchObject({ statusCode: 0 })
  })
  it("confirms the whole session using the existing endpoint", async () => {
    const confirmed = { ...row, confirmedAt: "2026-10-09T02:00:00Z" }
    request.mockResolvedValue({ statusCode: 201, data: [confirmed] })
    const rows = await api.confirm("session:1")
    expect(rows).toEqual([confirmed])
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ url: "https://api.example.test/evaluations/staff/sessions/session%3A1/confirm", method: "POST", data: {} }))
  })
  it.each([undefined, [], [row], [{ ...row, confirmedAt: "invalid" }]])("rejects confirmation without confirmed grades", async data => {
    request.mockResolvedValue({ statusCode: 201, data })
    await expect(api.confirm("s1")).rejects.toMatchObject({ statusCode: 0 })
  })
  it("loads students, standards and current observations without changing their semantics", async () => {
    const data = { organizationId: "org1", students: [{ personRef: row.personRef, displayName: row.displayName, gradeName: null, className: null }], evaluations: [row], standards: [{ id: "std1", tourSessionId: "s1", title: "研学评价", version: 1, confirmedAt: "2026-10-09T01:00:00Z", items: [{ code: "A", label: "优秀", description: "" }, { code: "B", label: "合格", description: "" }], dimensions: [] }] }
    request.mockResolvedValue({ statusCode: 200, data })
    const result = await api.getDashboard("s1")
    expect(result).toEqual(data)
  })
})
