import { describe, expect, it } from "vitest"
import * as parser from "./execution.parser.js"

describe("person daily input", () => {
  const valid = { reportDate: "2026-09-27", lodgingCheck: "已查房", mealStatus: "已用餐", bodyStatus: "", note: "", expectedVersion: 0 }
  it("parses creation with an explicit zero version", () => {
    // Given a new daily report; when parsed; then creation remains explicit.
    expect(parser.parsePersonDailyInput(valid)).toEqual(valid)
  })
  it("accepts separate meals without legacy summaries", () => {
    expect(parser.parsePersonDailyInput({ reportDate: valid.reportDate, expectedVersion: 0, breakfast: "recorded", lunch: "not_applicable", dinner: null, breakfastNote: "已用餐" })).toMatchObject({ breakfast: "recorded", lunch: "not_applicable", dinner: null, breakfastNote: "已用餐" })
  })
  it.each([true, "eaten", 0])("rejects invalid meal fact %s", (breakfast) => {
    expect(() => parser.parsePersonDailyInput({ ...valid, breakfast })).toThrow()
  })
  it("requires a reason when correcting an existing version", () => {
    expect(() => parser.parsePersonDailyInput({ ...valid, expectedVersion: 1 })).toThrow()
    expect(parser.parsePersonDailyInput({ ...valid, expectedVersion: 1, correctionReason: "补录午餐" })).toMatchObject({ correctionReason: "补录午餐" })
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
