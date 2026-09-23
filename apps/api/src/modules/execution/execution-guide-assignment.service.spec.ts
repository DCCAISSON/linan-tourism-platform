import { ForbiddenException } from "@nestjs/common"
import { describe, expect, it, vi } from "vitest"
import type { EntityManager } from "typeorm"
import { ExecutionGuideAssignmentEntity } from "../../domain/entities/execution-guide-assignment.entity.js"
import { StaffAccountEntity } from "../../domain/entities/staff-account.entity.js"
import { TourSessionEntity } from "../../domain/entities/tour-session.entity.js"
import { TransportSessionVehicleEntity } from "../../domain/entities/transport-session-vehicle.entity.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import type { StaffPermissionKey } from "../iam/staff-permissions.js"
import { assignmentScopeKey, ExecutionGuideAssignmentService } from "./execution-guide-assignment.service.js"

type FindOneKey = typeof StaffAccountEntity | typeof TourSessionEntity | typeof TransportSessionVehicleEntity | typeof ExecutionGuideAssignmentEntity

const manager = (rows: ReadonlyMap<FindOneKey, unknown>): EntityManager => ({
  findOneBy: vi.fn((entity: FindOneKey) => Promise.resolve(rows.get(entity) ?? null)),
  create: vi.fn((_: typeof ExecutionGuideAssignmentEntity, value: Partial<ExecutionGuideAssignmentEntity>) => Object.assign(new ExecutionGuideAssignmentEntity(), value)),
  save: vi.fn((value: ExecutionGuideAssignmentEntity) => Promise.resolve(value)),
}) as unknown as EntityManager

function rowMap(...entries: readonly (readonly [FindOneKey, unknown])[]): ReadonlyMap<FindOneKey, unknown> {
  return new Map(entries)
}

const managerAccess: StaffAccess = {
  kind: "administrator",
  actorId: "manager",
  forcePasswordChange: false,
  permissionKeys: new Set(["execution.manage"]),
  scopes: [{ kind: "all", id: null }],
}

describe("execution guide assignments", () => {
  it("stores a real guide assignment for the requested vehicle", async () => {
    // Given a manager, an active staff account, a session and a vehicle in that session.
    const session = Object.assign(new TourSessionEntity(), { id: "session", organizationId: "school" })
    const guide = Object.assign(new StaffAccountEntity(), { id: "guide", status: "active", expiresAt: null })
    const vehicle = Object.assign(new TransportSessionVehicleEntity(), { id: "vehicle", tourSessionId: "session" })
    const fakeManager = manager(rowMap([TourSessionEntity, session], [StaffAccountEntity, guide], [TransportSessionVehicleEntity, vehicle]))

    // When assigning the guide to the vehicle.
    const service = new ExecutionGuideAssignmentService({} as never)
    const saved = await service.assignIn(fakeManager, managerAccess, { staffAccountId: "guide", tourSessionId: "session", vehicleId: "vehicle", reason: "带车" })

    // Then the row is explicit and vehicle-scoped.
    expect(saved.staffAccountId).toBe("guide")
    expect(saved.tourSessionId).toBe("session")
    expect(saved.vehicleId).toBe("vehicle")
    expect(saved.scopeKey).toBe("vehicle")
    expect(saved.active).toBe(true)
  })

  it("rejects assignment maintenance without execution.manage", async () => {
    // Given a staff account without assignment management permission.
    const access = { ...managerAccess, permissionKeys: new Set<StaffPermissionKey>() }
    const service = new ExecutionGuideAssignmentService({} as never)

    // When assigning a guide; then it is rejected before implicit scope can grant access.
    await expect(service.assignIn(manager(new Map()), access, { staffAccountId: "guide", tourSessionId: "session", reason: "带团" })).rejects.toThrow(ForbiddenException)
  })

  it("rejects a contact-like staff id that is not an active account", async () => {
    // Given the session exists but the guide staff account does not.
    const session = Object.assign(new TourSessionEntity(), { id: "session", organizationId: "school" })
    const fakeManager = manager(rowMap([TourSessionEntity, session]))
    const service = new ExecutionGuideAssignmentService({} as never)

    // When assigning by an unknown id; then it is rejected.
    await expect(service.assignIn(fakeManager, managerAccess, { staffAccountId: "guide-name-only", tourSessionId: "session", reason: "带团" })).rejects.toThrow(ForbiddenException)
  })

  it("rejects a vehicle outside the requested session", async () => {
    // Given the vehicle belongs to another session.
    const session = Object.assign(new TourSessionEntity(), { id: "session", organizationId: "school" })
    const guide = Object.assign(new StaffAccountEntity(), { id: "guide", status: "active", expiresAt: null })
    const vehicle = Object.assign(new TransportSessionVehicleEntity(), { id: "vehicle", tourSessionId: "other" })
    const fakeManager = manager(rowMap([TourSessionEntity, session], [StaffAccountEntity, guide], [TransportSessionVehicleEntity, vehicle]))

    // When assigning that vehicle; then it is rejected.
    const service = new ExecutionGuideAssignmentService({} as never)
    await expect(service.assignIn(fakeManager, managerAccess, { staffAccountId: "guide", tourSessionId: "session", vehicleId: "vehicle", reason: "带车" })).rejects.toThrow(ForbiddenException)
  })
})

describe("assignment scope key", () => {
  it("uses a stable session key until a vehicle is provided", () => {
    // Given no vehicle; when deriving the key; then it does not depend on contact text.
    expect(assignmentScopeKey(undefined)).toBe("session")
    expect(assignmentScopeKey("vehicle")).toBe("vehicle")
  })
})
