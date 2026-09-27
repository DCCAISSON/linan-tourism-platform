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
})
