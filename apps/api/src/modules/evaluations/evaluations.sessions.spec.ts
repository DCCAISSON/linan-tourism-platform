import { ForbiddenException } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import { describe, expect, it } from "vitest"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { ExecutionAccessService } from "../execution/execution-access.service.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { EvaluationsService } from "./evaluations.service.js"

const sessions = [
  { id: "session-a", code: "第一团", organizationId: "school-a", catalogItemId: "catalog-a" },
  { id: "session-b", code: "第二团", organizationId: "school-a", catalogItemId: "catalog-a" },
  { id: "session-c", code: "外校团", organizationId: "school-b", catalogItemId: "catalog-b" },
]
const reader: StaffAccess = { kind: "administrator", actorId: "reader", forcePasswordChange: false, permissionKeys: new Set(["evaluations.read"]), scopes: [{ kind: "all", id: null }] }

async function fixture(assignedSessionIds: readonly string[] = []) {
  const manager = {
    find: async () => sessions,
    findBy: async () => [{ id: "catalog-a", title: "山水研学" }, { id: "catalog-b", title: "科技研学" }],
  }
  const module = await Test.createTestingModule({ providers: [EvaluationsService,
    { provide: ConfigurationDatabaseService, useValue: { getDataSource: async () => ({ manager }) } },
    { provide: ExecutionAccessService, useValue: { assignedSessionIds: async () => assignedSessionIds } },
  ] }).compile()
  return module.get(EvaluationsService)
}

describe("evaluation session choices", () => {
  it("returns course names only within a reader's session scope", async () => {
    // Given a reader authorized for one of three sessions.
    const service = await fixture()
    const scoped: StaffAccess = { ...reader, scopes: [{ kind: "tour_session", id: "session-a" }] }
    // When the reader loads the evaluation session choices.
    const result = await service.sessions(scoped)
    // Then the selector receives its display name and the school needed by the report.
    expect(result).toEqual([{ id: "session-a", code: "第一团", title: "山水研学", organizationId: "school-a" }])
  })

  it("lists only the report-authorized school's sessions for a school reader", async () => {
    // Given school-report permission without internal evaluation read permission.
    const service = await fixture()
    const school: StaffAccess = { ...reader, kind: "school", permissionKeys: new Set(["evaluations.school_report"]), scopes: [{ kind: "school", id: "school-a" }] }
    // When the choices are loaded, then no other school's name is disclosed.
    expect((await service.sessions(school)).map(row => row.id)).toEqual(["session-a", "session-b"])
  })

  it("intersects a guide's assigned sessions with the existing scope", async () => {
    // Given assignments in two schools but authorization for only school A.
    const service = await fixture(["session-a", "session-c"])
    const guide: StaffAccess = { ...reader, kind: "guide", scopes: [{ kind: "school", id: "school-a" }] }
    // When choices are loaded, then neither an unassigned nor an out-of-scope session appears.
    expect((await service.sessions(guide)).map(row => row.id)).toEqual(["session-a"])
  })

  it("returns no sessions to an unassigned guide", async () => {
    // Given a guide with read permission but no assignment.
    const service = await fixture()
    // When choices are loaded, then an all-scope grant cannot replace the assignment.
    expect(await service.sessions({ ...reader, kind: "guide" })).toEqual([])
  })

  it("does not turn a session-only school-report scope into school access", async () => {
    // Given report permission scoped only to a session, which cannot read a school report.
    const service = await fixture()
    const school: StaffAccess = { ...reader, permissionKeys: new Set(["evaluations.school_report"]), scopes: [{ kind: "tour_session", id: "session-a" }] }
    // When choices are loaded, then the same report authorization rule is retained.
    expect(await service.sessions(school)).toEqual([])
  })

  it("rejects accounts without either evaluation read permission", async () => {
    // Given an account with no evaluation permission.
    const service = await fixture()
    // When choices are requested, then scope alone grants no access.
    await expect(service.sessions({ ...reader, permissionKeys: new Set() })).rejects.toBeInstanceOf(ForbiddenException)
  })
})
