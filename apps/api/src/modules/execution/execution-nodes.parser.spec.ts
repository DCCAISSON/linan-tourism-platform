import { describe, expect, it } from "vitest"
import * as parser from "./execution.parser.js"

describe("execution node boundaries", () => {
  it("requires an explanation for a correction when an original is referenced", () => {
    // Given a correction without a reason; when parsed; then reject it.
    expect(() => parser.parseOccurrenceInput({ personRef: "paid:one", nodeId: null, reportDate: "2026-09-27", type: "attendance", label: "出发", occurredAt: "2026-09-27T01:00:00Z", status: "present", location: "", note: "", correctsId: "first", expectedVersion: 1, correctionReason: "" })).toThrow("更正原因")
  })
  it("accepts one explicit room check when a plan node is configured", () => {
    // Given an optional room-check node; when parsed; then preserve its date and label.
    expect(parser.parseExecutionNodeInput({ reportDate: "2026-09-27", type: "room_check", label: "晚间查房", scheduledTime: "21:30", active: true, expectedVersion: 0 })).toMatchObject({ type: "room_check", label: "晚间查房", scheduledTime: "21:30" })
  })
})
