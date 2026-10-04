import { afterEach, describe, expect, it, vi } from "vitest"
import * as execution from "@/api/execution"
import { guideSession, managementSession } from "./execution.fixtures"

const session = guideSession

describe("execution API", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("loads the guide session using the authenticated session route", async () => {
    // Given
    const request = vi.fn(async () => Response.json(session))
    vi.stubGlobal("fetch", request)
    // When
    const result = await execution.getGuideSession("session/1")
    // Then
    expect(result.code).toBe("研学团")
    expect(request).toHaveBeenCalledWith(expect.stringContaining("/staff/execution/sessions/session%2F1"), expect.objectContaining({ credentials: "include", method: "GET" }))
  })

  it("retains confirmation status and a separate minimal group roster", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(guideSession)))
    const result = await execution.getGuideSession("session-1")
    expect(result).toMatchObject({ confirmationStatus: "current", groupPeople: guideSession.groupPeople, vehicles: guideSession.vehicles })
  })

  it("reads the independent management projection without requiring guide assignment", async () => {
    const request = vi.fn(async () => Response.json(managementSession))
    vi.stubGlobal("fetch", request)
    const result = await execution.getExecutionManagementSession("session-1")
    expect(result.personDailyReports[0]).toMatchObject({ displayName: "学生甲", version: 2, lodgingCheck: "入住完成" })
    expect(request).toHaveBeenCalledWith(expect.stringContaining("/management/sessions/session-1"), expect.any(Object))
    expect(result.people[0]).not.toHaveProperty("healthAuthorized")
    expect(result.personDailyReports[0]).not.toHaveProperty("bodyStatus")
  })

  it("uses scoped eligible guide options with display names", async () => {
    const request = vi.fn(async () => Response.json([{ staffAccountId: "guide-1", displayName: "导游甲" }]))
    vi.stubGlobal("fetch", request)
    const result = await execution.listGuideAssignmentCandidates("session-1")
    expect(result).toEqual([{ staffAccountId: "guide-1", displayName: "导游甲" }])
    expect(request).toHaveBeenCalledWith(expect.stringContaining("/management/sessions/session-1/assignment-candidates"), expect.any(Object))
  })

  it("keeps legacy meal summaries separate when individual meal facts are absent", async () => {
    const legacy = { ...managementSession.personDailyReports[0], tourSessionId: "session-1", personRef: "paid:line-1", bodyStatus: "", note: "", healthReadable: false }
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([legacy])))
    const rows = await execution.listPersonDailyReports("session-1")
    expect(rows[0]).toMatchObject({ breakfast: null, lunch: null, dinner: null, breakfastNote: "", mealStatus: "正常用餐" })
  })

  it("parses safe meal history and drops private extra fields", async () => {
    const revision = { ...managementSession.personDailyReports[0], reportId: "daily-1", tourSessionId: "session-1", personRef: "paid:line-1", recordedBy: "guide-1", correctionReason: "补录午餐", createdAt: "2026-10-01T09:00:00Z", breakfast: "recorded", lunch: "not_applicable", dinner: null, breakfastNote: "已用餐", lunchNote: "提前离团", dinnerNote: "", bodyStatus: "private-body", note: "private-note", encryptedNote: "secret" }
    const request = vi.fn(async () => Response.json([revision]))
    vi.stubGlobal("fetch", request)
    const rows = await execution.listPersonDailyHistory("session/1", "daily/1")
    expect(rows[0]).toMatchObject({ breakfast: "recorded", lunch: "not_applicable", dinner: null, correctionReason: "补录午餐", recordedByName: "工作人员" })
    expect(rows[0]).not.toHaveProperty("bodyStatus")
    expect(rows[0]).not.toHaveProperty("note")
    expect(rows[0]).not.toHaveProperty("encryptedNote")
    expect(request).toHaveBeenCalledWith(expect.stringContaining("/sessions/session%2F1/person-daily-reports/daily%2F1/history"), expect.objectContaining({ method: "GET" }))
  })
})
