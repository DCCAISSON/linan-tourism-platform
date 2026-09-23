import { ConflictException, ForbiddenException } from "@nestjs/common"
import { describe, expect, it } from "vitest"
import { buildInsuranceDraft, diffInsuranceBatch, assertSensitiveExportAllowed, assertBatchSubmittable } from "./insurance.policy.js"
import type { InternalTravelerSnapshot, TravelerRecord } from "../travelers/travelers.types.js"

const baseTraveler: TravelerRecord = {
  personRef: "paid:line-1",
  sourceRefs: ["paid:line-1"],
  source: "paid",
  tourSessionId: "session-1",
  organizationId: "school-1",
  displayName: "测试学生",
  gradeId: "grade-1",
  classId: "class-1",
  gradeName: "三年级",
  className: "一班",
  participantKind: "student",
  importedRole: null,
  identityMasked: "330100********1234",
  phoneMasked: "139****0000",
  active: true,
  inactiveReason: null,
  eligibility: "paid",
  eligibilityReason: null,
  importVersion: null,
  identityHash: "identity-hash",
  phoneHash: "phone-hash",
  personDataKeyVersion: "v1",
  identityCiphertext: "identity-cipher",
  phoneCiphertext: "phone-cipher",
  familyId: "family-1",
  familyMemberId: "member-1",
  orderId: "order-1",
  orderLineId: "line-1",
  importPersonId: null,
  dedupeKey: "session-1:v1:identity-hash",
  conflict: null,
}

describe("insurance policy", () => {
  it("marks missing identity and source conflicts before a batch can be submitted", () => {
    const snapshot = travelerSnapshot([
      { ...baseTraveler, identityCiphertext: null, identityMasked: null },
      { ...baseTraveler, personRef: "paid:line-2", conflict: { code: "identity_fields_conflict", sourceRefs: ["paid:line-2", "imported:teacher-1"] } },
    ])

    const draft = buildInsuranceDraft({ id: "batch-1", actorId: "staff-1", snapshot, companyTemplateName: null })

    expect(draft.status).toBe("blocked")
    expect(draft.people.map((person) => person.issueCode)).toEqual(["missing_identity", "traveler_conflict"])
    expect(() => assertBatchSubmittable(draft, snapshot.rosterVersion)).toThrow(ConflictException)
  })

  it("detects roster additions and removals without changing insurance state automatically", () => {
    const batch = buildInsuranceDraft({ id: "batch-1", actorId: "staff-1", snapshot: travelerSnapshot([baseTraveler]), companyTemplateName: null })
    const next = travelerSnapshot([{ ...baseTraveler, personRef: "paid:line-2", displayName: "新增教师", orderLineId: "line-2" }])

    const diff = diffInsuranceBatch(batch, next)

    expect(diff.rosterChanged).toBe(true)
    expect(diff.addedRefs).toEqual(["paid:line-2"])
    expect(diff.removedRefs).toEqual(["paid:line-1"])
    expect(batch.people[0]?.status).toBe("ready")
  })

  it("requires the dedicated sensitive export permission for original identity export", () => {
    expect(() => assertSensitiveExportAllowed({ permissionKeys: new Set(["insurance.export"]) })).toThrow(ForbiddenException)
    expect(() => assertSensitiveExportAllowed({ permissionKeys: new Set(["insurance.export", "insurance.sensitive.export"]) })).not.toThrow()
  })
})

function travelerSnapshot(travelers: readonly TravelerRecord[]): InternalTravelerSnapshot {
  return {
    tourSessionId: "session-1",
    organizationId: "school-1",
    rosterVersion: travelers.map((traveler) => traveler.personRef).join(":"),
    travelers,
    sources: travelers,
    activeCount: travelers.length,
    inactiveCount: 0,
    conflictCount: travelers.filter((traveler) => traveler.conflict !== null).length,
  }
}
