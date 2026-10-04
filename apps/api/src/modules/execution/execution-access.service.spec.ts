import { ForbiddenException } from "@nestjs/common"
import { describe, expect, it, vi } from "vitest"
import type { EntityManager } from "typeorm"
import { ExecutionGuideAssignmentEntity } from "../../domain/entities/execution-guide-assignment.entity.js"
import { StaffAccountEntity } from "../../domain/entities/staff-account.entity.js"
import { TourSessionEntity } from "../../domain/entities/tour-session.entity.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { ExecutionAccessService } from "./execution-access.service.js"

type FindKey = typeof StaffAccountEntity | typeof TourSessionEntity

const guideAccess: StaffAccess = {
  kind: "guide",
  actorId: "guide",
  forcePasswordChange: false,
  permissionKeys: new Set(["media.read"]),
  scopes: [{ kind: "tour_session", id: "session" }],
}

function manager(rows: ReadonlyMap<FindKey, unknown>, assignments: readonly ExecutionGuideAssignmentEntity[]): EntityManager {
  return {
    findOneBy: vi.fn((entity: FindKey) => Promise.resolve(rows.get(entity) ?? null)),
    findBy: vi.fn(() => Promise.resolve(assignments)),
  } as unknown as EntityManager
}

function rowMap(...entries: readonly (readonly [FindKey, unknown])[]): ReadonlyMap<FindKey, unknown> {
  return new Map(entries)
}

describe("execution access service", () => {
  it("allows a guide only when the real account has an active assignment", async () => {
    // Given an active guide account, a scoped session and an active assignment.
    const account = Object.assign(new StaffAccountEntity(), { id: "guide", status: "active", expiresAt: null })
    const session = Object.assign(new TourSessionEntity(), { id: "session", organizationId: "school" })
    const assignment = Object.assign(new ExecutionGuideAssignmentEntity(), { staffAccountId: "guide", tourSessionId: "session", vehicleId: null, active: true })
    const service = new ExecutionAccessService({} as never)

    // When media asks for execution authorization; then the assignment is accepted.
    await expect(service.assertAssignedIn(manager(rowMap([StaffAccountEntity, account], [TourSessionEntity, session]), [assignment]), guideAccess, { sessionId: "session", vehicleId: undefined })).resolves.toBeUndefined()
  })

  it("rejects tour-session scope without an explicit guide assignment", async () => {
    // Given a guide with tour-session scope but no assignment row.
    const account = Object.assign(new StaffAccountEntity(), { id: "guide", status: "active", expiresAt: null })
    const session = Object.assign(new TourSessionEntity(), { id: "session", organizationId: "school" })
    const service = new ExecutionAccessService({} as never)

    // When media asks for execution authorization; then scope alone is not enough.
    await expect(service.assertAssignedIn(manager(rowMap([StaffAccountEntity, account], [TourSessionEntity, session]), []), guideAccess, { sessionId: "session", vehicleId: undefined })).rejects.toThrow(ForbiddenException)
  })
})
