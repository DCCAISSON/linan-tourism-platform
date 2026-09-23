import { describe, expect, it } from "vitest"
import { parseImportChange, parsePersonRef, parseTravelerQuery } from "./travelers.parser.js"

describe("travelers parser", () => {
  it("parses the stable paid and imported person refs", () => {
    // Given / When / Then
    expect(parsePersonRef("paid:line-1")).toBe("paid:line-1")
    expect(parsePersonRef("imported:person_1")).toBe("imported:person_1")
  })

  it("rejects stale-version payloads with malformed roster versions", () => {
    // Given / When / Then
    expect(() => parseImportChange({ expectedVersion: 1, expectedRosterVersion: "old", reason: "确认随队" })).toThrow("名单版本不正确")
  })

  it("keeps inactive hidden by default while accepting explicit source filters", () => {
    // Given
    const query = parseTravelerQuery({ source: "imported", page: "2", pageSize: "20" })
    // When / Then
    expect(query).toMatchObject({ includeInactive: false, source: "imported", page: 2, pageSize: 20 })
  })
})
