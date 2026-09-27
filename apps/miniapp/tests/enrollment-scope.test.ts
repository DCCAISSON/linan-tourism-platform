import { describe, expect, it } from "vitest"
import { parseEnrollmentScope } from "../src/enrollment-scope-parser"
describe("session enrollment scope parsing", () => {
  it("keeps older omitted or null scope school-wide", () => {
    expect(parseEnrollmentScope(undefined)).toBeNull()
    expect(parseEnrollmentScope(null)).toBeNull()
  })
  it("retains grade-wide and selected-class rules", () => {
    const scope = [{ gradeId: "g1", classIds: null }, { gradeId: "g2", classIds: ["c1", "c2"] }]
    expect(parseEnrollmentScope(scope)).toEqual(scope)
  })
  it.each([[], [{ gradeId: "g", classIds: [] }], [{ gradeId: "g", classIds: ["c", "c"] }], [{ gradeId: "g", classIds: null }, { gradeId: "g", classIds: null }]].map(scope => ({ scope })))("rejects malformed scope $scope", ({ scope }) => {
    expect(() => parseEnrollmentScope(scope)).toThrow()
  })
})
