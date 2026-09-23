import { ForbiddenException } from "@nestjs/common"
import { describe, expect, it } from "vitest"
import { assertAssignmentAccess } from "./execution-access.policy.js"

describe("explicit guide assignment", () => {
  const assignment = { tourSessionId: "session", vehicleId: "car", active: true }
  it("rejects session scope when there is no explicit assignment", () => {
    // Given a scoped guide without an assignment; when requesting the session; then deny.
    expect(() => assertAssignmentAccess([], "session")).toThrow(ForbiddenException)
  })
  it("allows session media for a vehicle assignment", () => {
    // Given an active vehicle assignment; when requesting session media; then allow.
    expect(() => assertAssignmentAccess([assignment], "session")).not.toThrow()
  })
  it("denies another vehicle and a revoked assignment", () => {
    // Given a different vehicle or revoked assignment; when requesting the car; then deny.
    expect(() => assertAssignmentAccess([assignment], "session", "other")).toThrow(ForbiddenException)
    expect(() => assertAssignmentAccess([{ ...assignment, active: false }], "session", "car")).toThrow(ForbiddenException)
  })
  it("does not turn a session-only assignment into passenger access", () => {
    // Given session-only responsibility; when requesting a vehicle; then deny.
    expect(() => assertAssignmentAccess([{ ...assignment, vehicleId: null }], "session", "car")).toThrow(ForbiddenException)
  })
})
