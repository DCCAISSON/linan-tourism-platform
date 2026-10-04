import { describe, expect, it } from "vitest"
import { ADD_REFUND_APPLICATIONS_SQL } from "./1765947600000-AddRefundApplications.js"

describe("AddRefundApplications migration SQL", () => {
  it("quotes the json lines column because lines is not accepted bare by the target MySQL parser", () => {
    // Given / When
    const ddl = ADD_REFUND_APPLICATIONS_SQL

    // Then
    expect(ddl).toContain("`lines` json NOT NULL")
    expect(ddl).not.toMatch(/(^|\s)lines\s+json\s+NOT\s+NULL/i)
  })
})
