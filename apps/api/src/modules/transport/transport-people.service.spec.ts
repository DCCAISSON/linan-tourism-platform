import { Test } from "@nestjs/testing"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TourSessionEntity } from "../../domain/entities/index.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import { DevStaffAccessService, type StaffAccess } from "../iam/dev-staff-access.service.js"
import * as travelersRead from "../travelers/travelers.read-model.js"
import type { TravelerRecord } from "../travelers/travelers.types.js"
import { TransportPeopleService } from "./transport-people.service.js"

const access: StaffAccess = { kind: "school", actorId: "operator", forcePasswordChange: false,
  permissionKeys: new Set(["transport.write", "transport.read"]), scopes: [{ kind: "school", id: "school" }] }
const version = { expectedPlanVersion: 3, expectedRosterVersion: "roster-1" }

afterEach(() => vi.restoreAllMocks())

describe("transport confirmation completeness", () => {
  it("confirms when all five active travelers occupy two vehicles within capacity", async () => {
    const fixture = await confirmationFixture({ assignedCount: 5, firstCapacity: 3 })
    try {
      const result = await fixture.service.confirmPlan(access, "session", version)
      expect(result.assignments).toHaveLength(5)
      expect(fixture.inserted).toHaveLength(1)
      expect(fixture.reads[0]).toContain("for update")
    } finally { await fixture.module.close() }
  })

  it("rejects confirmation when one of five active travelers is unassigned", async () => {
    const fixture = await confirmationFixture({ assignedCount: 4, firstCapacity: 3 })
    try {
      await expect(fixture.service.confirmPlan(access, "session", version)).rejects.toMatchObject({
        response: { code: "unassigned_travelers" },
      })
      expect(fixture.inserted).toHaveLength(0)
    } finally { await fixture.module.close() }
  })

  it("rejects confirmation after a vehicle capacity falls below its assigned headcount", async () => {
    const fixture = await confirmationFixture({ assignedCount: 5, firstCapacity: 2 })
    try {
      await expect(fixture.service.confirmPlan(access, "session", version)).rejects.toMatchObject({
        response: { code: "vehicle_over_capacity" },
      })
      expect(fixture.inserted).toHaveLength(0)
    } finally { await fixture.module.close() }
  })

  it("rejects confirmation when a saved assignment points to an inactive traveler", async () => {
    const fixture = await confirmationFixture({ assignedCount: 5, firstCapacity: 3, inactiveLast: true })
    try {
      await expect(fixture.service.confirmPlan(access, "session", version)).rejects.toMatchObject({
        response: { code: "traveler_conflict" },
      })
      expect(fixture.inserted).toHaveLength(0)
    } finally { await fixture.module.close() }
  })

  it.each(["unconfirmed", "stale"] as const)("rejects final export when the confirmation is %s", async (status) => {
    const fixture = await confirmationFixture({ assignedCount: 5, firstCapacity: 3, confirmationStatus: status })
    try {
      await expect(fixture.service.exportPeoplePlan(access, "session")).rejects.toMatchObject({
        response: { code: "transport_not_current" },
      })
    } finally { await fixture.module.close() }
  })

  it("exports the current stored snapshot instead of the live assignment display name", async () => {
    const fixture = await confirmationFixture({ assignedCount: 5, firstCapacity: 3, confirmationStatus: "current" })
    try {
      const result = await fixture.service.exportPeoplePlan(access, "session")
      expect(result.snapshot.assignments[0]?.displayName).toBe("确认时姓名")
      expect(fixture.reads[0]).toContain("for update")
    } finally { await fixture.module.close() }
  })

  it("keeps a refunded source that disappeared from travelers readable as an inactive assignment", async () => {
    const fixture = await confirmationFixture({ assignedCount: 5, firstCapacity: 3, missingLast: true })
    try {
      const result = await fixture.service.readPeoplePlan(access, "session")
      expect(result.assignments).toHaveLength(5)
      expect(result.assignments[4]).toMatchObject({ personRef: "paid:line-4", active: false, conflict: { code: "eligibility_conflict" } })
      expect(result.vehicles.reduce((sum, vehicle) => sum + vehicle.actualOccupancy, 0)).toBe(4)
    } finally { await fixture.module.close() }
  })

  it("rejects confirmation while a disappeared source remains assigned", async () => {
    const fixture = await confirmationFixture({ assignedCount: 5, firstCapacity: 3, missingLast: true })
    try {
      await expect(fixture.service.confirmPlan(access, "session", version)).rejects.toMatchObject({ response: { code: "traveler_conflict" } })
      expect(fixture.inserted).toHaveLength(0)
    } finally { await fixture.module.close() }
  })

  it("can save just the four active travelers after removing the refunded assignment", async () => {
    const fixture = await confirmationFixture({ assignedCount: 5, firstCapacity: 3, missingLast: true })
    try {
      const result = await fixture.service.saveAssignments(access, "session", { ...version,
        assignments: [0, 1, 2, 3].map(index => ({ personRef: `paid:line-${index}`, vehicleId: index < 3 ? "vehicle-1" : "vehicle-2" })),
      })
      expect(result.assignments).toHaveLength(4)
      expect(result.assignments.every(assignment => assignment.active && assignment.conflict === null)).toBe(true)
      expect(result.unassigned).toEqual([])
    } finally { await fixture.module.close() }
  })
})

async function confirmationFixture(input: { readonly assignedCount: number; readonly firstCapacity: number; readonly inactiveLast?: boolean; readonly missingLast?: boolean; readonly confirmationStatus?: "unconfirmed" | "stale" | "current" }) {
  const session = Object.assign(new TourSessionEntity(), { id: "session", organizationId: "school" })
  const travelers: readonly TravelerRecord[] = Array.from({ length: 5 }, (_, index) => ({
    personRef: `paid:line-${index}`, sourceRefs: [`paid:line-${index}`], source: "paid", tourSessionId: "session",
    organizationId: "school", displayName: `成员${index + 1}`, gradeId: "grade", classId: "class", gradeName: "一年级",
    className: "一班", participantKind: "student", importedRole: null, identityMasked: null, phoneMasked: null,
    active: !(input.inactiveLast && index === 4), inactiveReason: null, eligibility: "paid", eligibilityReason: null, importVersion: null, conflict: null,
    identityHash: null, phoneHash: null, personDataKeyVersion: "v1", identityCiphertext: null, phoneCiphertext: null,
    familyId: "family", familyMemberId: null, orderId: "order", orderLineId: `line-${index}`, importPersonId: null,
    dedupeKey: `paid:line-${index}`,
  }))
  const currentTravelers = input.missingLast ? travelers.slice(0, 4) : travelers
  vi.spyOn(travelersRead, "readTravelers").mockResolvedValue({
    tourSessionId: "session", organizationId: "school", rosterVersion: "roster-1", travelers: currentTravelers, sources: currentTravelers,
    activeCount: currentTravelers.length, inactiveCount: 0, conflictCount: 0,
  })
  let assignments: { personRef: string; vehicleId: string }[] = travelers.slice(0, input.assignedCount).map((person, index) => ({
    personRef: person.personRef, vehicleId: index < 3 ? "vehicle-1" : "vehicle-2",
  }))
  const inserted: unknown[] = []
  const reads: string[] = []
  const manager = {
    findOneBy: async () => { reads.push("find session"); return session },
    query: async (sql: string, parameters: readonly unknown[] = []) => {
      reads.push(sql)
      if (sql.startsWith("select id from tour_sessions")) return [{ id: "session" }]
      if (sql.startsWith("select version")) return [{ version: 3 }]
      if (sql.includes("from transport_session_vehicles v")) return [input.firstCapacity, 2].map((capacity, index) => ({
        allocationId: null, vehicleId: `vehicle-${index + 1}`, sequence: index + 1, seatCapacity: capacity,
        plateNumber: `浙A0000${index + 1}`, contactSnapshotJson: {}, classId: null, className: null, gradeName: null,
        studentCount: null, guardianCount: null, teacherCount: null, otherCount: null, note: null,
      }))
      if (sql.startsWith("select id, seat_capacity")) return [{ id: "vehicle-1", seatCapacity: input.firstCapacity }, { id: "vehicle-2", seatCapacity: 2 }]
      if (sql.startsWith("delete from transport_person_allocations")) { assignments = []; return [] }
      if (sql.startsWith("insert into transport_person_allocations")) {
        for (let index = 0; index < parameters.length; index += 6) {
          const vehicleId = parameters[index + 2]
          const personRef = parameters[index + 3]
          if (typeof vehicleId !== "string" || typeof personRef !== "string") throw new Error("invalid stored allocation")
          assignments.push({ vehicleId, personRef })
        }
      }
      if (sql.includes("from transport_person_allocations")) return assignments
      if (sql.includes("insert into transport_confirmations")) inserted.push(parameters)
      if (sql.includes("from transport_plans p join") && input.confirmationStatus && input.confirmationStatus !== "unconfirmed") {
        return [{ id: "confirmation", planVersion: input.confirmationStatus === "stale" ? 2 : 3, currentPlanVersion: 3,
          rosterVersion: "roster-1", confirmedAt: "2026-09-27", confirmedBy: "operator", snapshotJson: {
            vehicles: [{ id: "vehicle-1", sequence: 1 }], assignments: [{ personRef: "paid:line-0", vehicleId: "vehicle-1", displayName: "确认时姓名" }],
          } }]
      }
      return []
    },
  }
  const module = await Test.createTestingModule({ providers: [TransportPeopleService,
    { provide: ConfigurationDatabaseService, useValue: { getDataSource: async () => ({ manager, transaction: async (action: (store: typeof manager) => Promise<unknown>) => action(manager) }) } },
    { provide: DevStaffAccessService, useValue: { assertTransportReadScope: () => undefined, assertTransportWriteScope: () => undefined, assertTransportExportScope: () => undefined } },
    { provide: AuditLogService, useValue: { record: async () => undefined } },
  ] }).compile()
  return { service: module.get(TransportPeopleService), module, inserted, reads }
}
