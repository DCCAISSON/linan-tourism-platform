import { describe, expect, it } from "vitest"
import { buildTravelerSnapshot } from "./travelers.merge.js"
import { toTravelerDto } from "./travelers.read-model.js"
import type { TravelerSource } from "./travelers.types.js"

const session = { id: "session", organizationId: "school" }
function source(overrides: Partial<TravelerSource> = {}): TravelerSource {
  return {
    personRef: "paid:line", source: "paid", tourSessionId: session.id, organizationId: session.organizationId,
    displayName: "测试学生", gradeId: "grade", classId: "class", gradeName: "三年级", className: "一班",
    participantKind: "student", importedRole: null, identityMasked: "masked", phoneMasked: "masked",
    active: true, inactiveReason: null, eligibility: "paid", eligibilityReason: null, importVersion: null,
    identityHash: "identity", phoneHash: "phone", personDataKeyVersion: "v1", identityCiphertext: "cipher",
    phoneCiphertext: "cipher", familyId: "family", familyMemberId: "member", orderId: "order", orderLineId: "line",
    importPersonId: null, ...overrides,
  }
}
function imported(overrides: Partial<TravelerSource> = {}): TravelerSource {
  return source({ personRef: "imported:import", source: "imported", importedRole: "student", eligibility: "pending",
    active: false, inactiveReason: "eligibility_pending", importVersion: 1, familyId: null, familyMemberId: null,
    orderId: null, orderLineId: null, importPersonId: "import", ...overrides })
}

describe("unified travelers", () => {
  it("merges matching paid and imported credentials while preserving both permanent refs", () => {
    // Given
    const records = [source(), imported()]
    // When
    const snapshot = buildTravelerSnapshot(session, records)
    // Then
    expect(snapshot.activeCount).toBe(1)
    expect(snapshot.travelers).toHaveLength(1)
    expect(snapshot.travelers[0]?.sourceRefs).toEqual(["imported:import", "paid:line"])
    expect(snapshot.sources.find((person) => person.personRef === "imported:import")?.active).toBe(true)
  })
  it("keeps same names with different or missing credentials separate", () => {
    // Given
    const records = [source(), imported({ identityHash: "different" }), source({ personRef: "paid:legacy", identityHash: null })]
    // When
    const snapshot = buildTravelerSnapshot(session, records)
    // Then
    expect(snapshot.travelers).toHaveLength(3)
  })
  it("blocks cancelled paid plus enabled import instead of reviving the person", () => {
    // Given
    const records = [source({ active: false, inactiveReason: "cancelled" }), imported({ importedRole: "teacher", participantKind: "adult", eligibility: "teacher", active: true, inactiveReason: null })]
    // When
    const snapshot = buildTravelerSnapshot(session, records)
    // Then
    expect(snapshot.activeCount).toBe(0)
    expect(snapshot.conflictCount).toBe(1)
    expect(snapshot.travelers[0]?.conflict?.code).toBe("eligibility_conflict")
    expect(snapshot.sources.find((person) => person.source === "paid")?.active).toBe(false)
  })
  it("removes an eligibility conflict when its imported source is explicitly disabled", () => {
    // Given
    const records = [source({ active: false, inactiveReason: "cancelled" }), imported({ eligibility: "disabled", inactiveReason: "import_disabled" })]
    // When
    const snapshot = buildTravelerSnapshot(session, records)
    // Then
    expect(snapshot.conflictCount).toBe(0)
    expect(snapshot.inactiveCount).toBe(1)
  })
  it("blocks two active paid sources with the same identity", () => {
    // Given
    const records = [source(), source({ personRef: "paid:another" })]
    // When
    const snapshot = buildTravelerSnapshot(session, records)
    // Then
    expect(snapshot.travelers[0]?.conflict?.code).toBe("duplicate_paid_sources")
    expect(snapshot.activeCount).toBe(0)
  })
  it("detects concrete identity fields conflicts instead of selecting the first source", () => {
    // Given
    const records = [source(), imported({ classId: "other-class" })]
    // When
    const snapshot = buildTravelerSnapshot(session, records)
    // Then
    expect(snapshot.travelers[0]?.conflict?.code).toBe("identity_fields_conflict")
  })
  it("keeps a new paid ref actionable without reviving the historical cancelled ref", () => {
    // Given
    const records = [source({ active: false, inactiveReason: "cancelled" }), source({ personRef: "paid:new" })]
    // When
    const snapshot = buildTravelerSnapshot(session, records)
    // Then
    expect(snapshot.activeCount).toBe(1)
    expect(snapshot.sources.find((person) => person.personRef === "paid:line")?.active).toBe(false)
    expect(snapshot.travelers[0]?.personRef).toBe("paid:new")
  })
  it("changes the version when eligibility changes even if the person count does not", () => {
    // Given
    const before = buildTravelerSnapshot(session, [imported()])
    // When
    const after = buildTravelerSnapshot(session, [imported({ active: true, inactiveReason: null, eligibility: "confirmed", importVersion: 2 })])
    // Then
    expect(after.rosterVersion).not.toBe(before.rosterVersion)
  })
  it("keeps roster versions stable across query ordering", () => {
    // Given
    const records = [source(), imported()]
    // When
    const snapshot = buildTravelerSnapshot(session, [...records].reverse())
    // Then
    expect(snapshot.rosterVersion).toBe(buildTravelerSnapshot(session, records).rosterVersion)
  })
  it("keeps internal identity hashes out of client traveler DTOs", () => {
    // Given
    const snapshot = buildTravelerSnapshot(session, [source()])
    const record = snapshot.travelers[0]
    if (record === undefined) throw new Error("expected traveler")
    // When
    const dto = toTravelerDto(record)
    // Then
    expect("identityHash" in dto).toBe(false)
    expect("dedupeKey" in dto).toBe(false)
  })
})
