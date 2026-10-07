import { describe, expect, it } from "vitest"
import { parseTourSession, parseTourSessionPatch } from "./configuration.parser.js"

const session = {
  organizationId: "school", catalogItemId: "catalog", code: "trip", status: "published",
  priceFen: 12800, capacity: 30, startsAt: "2027-02-01T00:00:00Z", endsAt: "2027-02-02T00:00:00Z",
  enrollmentOpensAt: "2026-09-01T00:00:00Z", enrollmentClosesAt: "2027-01-01T00:00:00Z",
}

describe("Tour session capacity input", () => {
  it.each([0, -1, 1.5, "2", null])("rejects invalid capacity %s when creating a session", capacity => {
    // Given / When / Then
    expect(() => parseTourSession({ ...session, capacity })).toThrow()
  })

  it.each([0, -1, 1.5, "2", null])("rejects invalid capacity %s when editing a session", capacity => {
    // Given / When / Then
    expect(() => parseTourSessionPatch({ capacity })).toThrow()
  })

  it("accepts a positive capacity when editing a session", () => {
    // Given / When / Then
    expect(parseTourSessionPatch({ capacity: 1 }).capacity).toBe(1)
  })

  it("leaves capacity unchanged when omitted from an edit", () => {
    // Given / When / Then
    expect(parseTourSessionPatch({ code: "updated" }).capacity).toBeUndefined()
  })
})
