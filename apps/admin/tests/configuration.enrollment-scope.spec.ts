import { describe, expect, it } from "vitest"
import { parseTourSession } from "../src/api/configuration.parsers"
describe("enrollment scope response", () => {
  it("defaults old responses to school-wide", () => {
    expect(parseTourSession({}).enrollmentScope).toBeNull()
  })
  it("retains mixed full-grade and class scope", () => {
    const enrollmentScope = [{ gradeId: "g1", classIds: null }, { gradeId: "g2", classIds: ["c2"] }]
    expect(parseTourSession({ enrollmentScope }).enrollmentScope).toEqual(enrollmentScope)
  })
  it.each([[], [{ gradeId: "g", classIds: [] }], [{ gradeId: "g", classIds: [1] }], [{ gradeId: "g", classIds: null }, { gradeId: "g", classIds: null }]].map(enrollmentScope => ({ enrollmentScope })))("rejects malformed scope $enrollmentScope", ({ enrollmentScope }) => {
    expect(() => parseTourSession({ enrollmentScope })).toThrow()
  })
})
