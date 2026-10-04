import { describe, expect, it } from "vitest"
import { ConflictException, ForbiddenException } from "@nestjs/common"
import type { TravelerRecord } from "../travelers/travelers.types.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { assertAttendanceTravelerWritable, assertHealthReadable } from "./execution-rules.js"

const activeTraveler: TravelerRecord = {
  personRef: "paid:line-1", sourceRefs: ["paid:line-1"], source: "paid", tourSessionId: "session-1", organizationId: "org-1",
  displayName: "学生甲", gradeId: null, classId: null, gradeName: null, className: null, participantKind: "student", importedRole: null,
  identityMasked: null, phoneMasked: null, active: true, inactiveReason: null, eligibility: "paid", eligibilityReason: null,
  importVersion: null, conflict: null, identityHash: null, phoneHash: null, personDataKeyVersion: "v1", identityCiphertext: null,
  phoneCiphertext: null, familyId: "family-1", familyMemberId: "member-1", orderId: "order-1", orderLineId: "line-1",
  importPersonId: null, dedupeKey: "paid:line-1",
}
const cancelledTraveler: TravelerRecord = { ...activeTraveler, active: false, inactiveReason: "cancelled" }
const healthReader: StaffAccess = { kind: "guide", actorId: "guide-1", forcePasswordChange: false, permissionKeys: new Set(["health.read"]), scopes: [{ kind: "tour_session", id: "session-1" }] }

describe("execution rules", () => {
  it("rejects new attendance for cancelled travelers but allows undo", () => {
    expect(() => assertAttendanceTravelerWritable(activeTraveler, "present")).not.toThrow()
    expect(() => assertAttendanceTravelerWritable(cancelledTraveler, "present")).toThrow(ConflictException)
    expect(() => assertAttendanceTravelerWritable(cancelledTraveler, "revoked")).not.toThrow()
  })

  it("requires health.read and active family authorization for raw health", () => {
    expect(() => assertHealthReadable(healthReader, { revokedAt: null })).not.toThrow()
    expect(() => assertHealthReadable({ ...healthReader, permissionKeys: new Set() }, { revokedAt: null })).toThrow(ForbiddenException)
    expect(() => assertHealthReadable(healthReader, { revokedAt: new Date() })).toThrow(ForbiddenException)
    expect(() => assertHealthReadable(healthReader, null)).toThrow(ForbiddenException)
  })
})
