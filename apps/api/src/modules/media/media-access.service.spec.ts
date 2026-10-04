import { ForbiddenException } from "@nestjs/common"
import type { EntityManager } from "typeorm"
import { describe, expect, it, vi } from "vitest"
import { TourSessionEntity } from "../../domain/entities/tour-session.entity.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { MediaAccessService, mediaScopeMatches } from "./media-access.service.js"

const session = Object.assign(new TourSessionEntity(), { id: "session-a", organizationId: "school-a" })
const manager = { findOneBy: async () => session, find: async () => [session] } as unknown as EntityManager
const scopedStaff: StaffAccess = { actorId: "staff-a", kind: "administrator", forcePasswordChange: false, permissionKeys: new Set(["media.read", "media.upload"]), scopes: [{ kind: "school", id: "school-a" }] }
const guide: StaffAccess = { actorId: "guide-a", kind: "guide", forcePasswordChange: false, permissionKeys: new Set(["media.read", "media.upload"]), scopes: [{ kind: "tour_session", id: "session-a" }] }

describe("media access", () => {
  it("matches staff media permissions against the real session scope", () => {
    // Given / When / Then
    expect(mediaScopeMatches(scopedStaff, session, "media.read")).toBe(true)
    expect(mediaScopeMatches({ ...scopedStaff, permissionKeys: new Set(["media.upload"]) }, session, "media.read")).toBe(false)
    expect(mediaScopeMatches({ ...scopedStaff, scopes: [{ kind: "tour_session", id: "other" }] }, session, "media.read")).toBe(false)
  })

  it("requires a real guide assignment before upload or read access", async () => {
    // Given
    const execution = { assertAssigned: vi.fn<() => Promise<void>>().mockResolvedValue(undefined), assignedSessionIds: vi.fn<() => Promise<readonly string[]>>().mockResolvedValue(["session-a"]) }
    const service = new MediaAccessService(execution as never)
    // When
    await service.staffSession(manager, guide, "session-a", "media.upload")
    // Then
    expect(execution.assertAssigned).toHaveBeenCalledWith(guide, "session-a")
  })

  it("does not default allow an unassigned guide", async () => {
    // Given
    const execution = { assertAssigned: vi.fn<() => Promise<void>>().mockRejectedValue(new ForbiddenException()), assignedSessionIds: vi.fn<() => Promise<readonly string[]>>().mockResolvedValue([]) }
    const service = new MediaAccessService(execution as never)
    // When / Then
    await expect(service.staffSession(manager, guide, "session-a", "media.read")).rejects.toBeInstanceOf(ForbiddenException)
    await expect(service.sessions(manager, guide)).resolves.toEqual([])
  })
})
