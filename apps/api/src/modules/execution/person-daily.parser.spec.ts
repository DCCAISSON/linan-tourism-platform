import { describe, expect, it } from "vitest"
import * as parser from "./execution.parser.js"

describe("person daily input", () => {
  const valid = { reportDate: "2026-09-27", lodgingCheck: "已查房", mealStatus: "已用餐", bodyStatus: "", note: "", expectedVersion: 0 }
  it("parses creation with an explicit zero version", () => {
    // Given a new daily report; when parsed; then creation remains explicit.
    expect(parser.parsePersonDailyInput(valid)).toEqual(valid)
  })
  it.each(["2026-02-30", "2026-13-01", "2026-9-27"])("rejects invalid calendar date %s", (reportDate) => {
    // Given a malformed calendar date; when parsed; then reject it.
    expect(() => parser.parsePersonDailyInput({ ...valid, reportDate })).toThrow()
  })
  it.each([undefined, -1, 1.5, "1"])("rejects ambiguous version %s", (expectedVersion) => {
    // Given no valid concurrency token; when parsed; then reject it.
    expect(() => parser.parsePersonDailyInput({ ...valid, expectedVersion })).toThrow()
  })
})
