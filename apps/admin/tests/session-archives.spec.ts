import { describe, expect, it } from "vitest"
import { parseArchiveSummary } from "../src/api/session-archives"

describe("archive API boundary", () => {
  it("retains unavailable transport status instead of inventing a final roster", () => {
    const result = parseArchiveSummary({ id: "archive", version: 1, creatorName: "工作人员", createdAt: "2026-09-28T00:00:00Z", sections: [{ key: "transport", capturedAt: "2026-09-28T00:00:00Z", status: "已失效，未归档最终分车名单", rowCount: 0 }] })
    expect(result.sections[0]).toMatchObject({ status: "已失效，未归档最终分车名单", rowCount: 0 })
  })
  it("rejects unknown sections and malformed versions at the boundary", () => {
    const valid = { id: "archive", version: 1, creatorName: "工作人员", createdAt: "2026-09-28T00:00:00Z", sections: [] }
    expect(() => parseArchiveSummary({ ...valid, version: "1" })).toThrow()
    expect(() => parseArchiveSummary({ ...valid, sections: [{ key: "health" }] })).toThrow()
  })
})
