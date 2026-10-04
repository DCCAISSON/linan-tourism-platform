import { describe, expect, it } from "vitest"
import { parseDateStatisticsFilters } from "./date-statistics.service.js"

describe("departure date statistics input", () => {
  it("accepts inclusive dates and optional school without demanding one session", () => {
    expect(parseDateStatisticsFilters({ from: "2026-10-01", until: "2026-10-31" })).toEqual({ from: "2026-10-01", until: "2026-10-31", schoolId: null })
    expect(parseDateStatisticsFilters({ from: "2026-10-01", until: "2026-10-01", schoolId: "school-1" }).schoolId).toBe("school-1")
  })
  it.each([
    { from: "2026-02-30", until: "2026-03-01" },
    { from: "2026-10-02", until: "2026-10-01" },
    { from: "2026-10-01", until: "2026-10-02", classId: "class-1" },
    { from: "2026-10-01", until: "2026-10-02", schoolId: "' or 1=1" },
  ])("rejects invalid calendar, reverse range, unsupported class and invalid school %j", value => {
    expect(() => parseDateStatisticsFilters(value)).toThrow()
  })
})
