import { describe, expect, it } from "vitest"
import { parseTourSessionPatch } from "./configuration.parser.js"

describe("tour session enrollment scope boundary", () => {
  it("keeps a selected grade and classes when supplied", () => {
    // Given
    const enrollmentScope = [{ gradeId: "grade-one", classIds: ["class-one"] }]
    // When
    const parsed = parseTourSessionPatch({ enrollmentScope })
    // Then
    expect(parsed).toHaveProperty("enrollmentScope", enrollmentScope)
  })

  it.each([[], [{ gradeId: "g", classIds: [] }], [{ gradeId: "g", classIds: ["c", "c"] }], [{ gradeId: "g", classIds: null }, { gradeId: "g", classIds: null }], [{ gradeId: "g" }]].map((enrollmentScope) => ({ enrollmentScope })))("rejects malformed or duplicate scope $enrollmentScope", ({ enrollmentScope }) => {
    // Given / When / Then
    expect(() => parseTourSessionPatch({ enrollmentScope })).toThrow()
  })

  it("clears scope only when explicit null is supplied", () => {
    // Given / When / Then
    expect(parseTourSessionPatch({ enrollmentScope: null })).toHaveProperty("enrollmentScope", null)
    expect(parseTourSessionPatch({}).enrollmentScope).toBeUndefined()
  })
})
