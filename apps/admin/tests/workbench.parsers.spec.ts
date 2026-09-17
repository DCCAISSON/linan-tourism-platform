import { describe, expect, it } from "vitest"
import { parseWorkbenchSummary } from "@/api/workbench"

const response = {
  generatedAt: "2026-09-17T00:00:00.000Z", upcomingFrom: "2026-09-17T00:00:00.000Z", upcomingUntil: "2026-10-17T00:00:00.000Z",
  activeActivityCount: 2, upcomingSessionCount: 0, paidHeadcount: 2, paidAmountFen: 25600, upcomingSessions: [],
} as const

describe("workbench response boundary", () => {
  it("preserves verified counts and integer fen when the response is valid", () => {
    expect(parseWorkbenchSummary(response).paidAmountFen).toBe(25600)
  })
  it.each([undefined, -1, 1.2, "25600", Number.MAX_SAFE_INTEGER + 1])("rejects unverified money %s instead of converting it to zero", paidAmountFen => {
    expect(() => parseWorkbenchSummary({ ...response, paidAmountFen })).toThrow("paidAmountFen")
  })
})
