import { DataSource } from "typeorm"
import { afterEach, describe, expect, it, vi } from "vitest"
import * as travelers from "../travelers/travelers.read-model.js"
import { readTransportConfirmation } from "./transport-confirmation.read.js"

afterEach(() => vi.restoreAllMocks())

describe("confirmed transport reader", () => {
  it.each([
    { name: "unconfirmed", rows: [], expected: "unconfirmed" },
    { name: "draft version changed", rows: [{ id: "confirmation", planVersion: 2, currentPlanVersion: 3, rosterVersion: "roster", snapshotJson: "malformed" }], expected: "stale" },
    { name: "roster changed", rows: [{ id: "confirmation", planVersion: 2, currentPlanVersion: 2, rosterVersion: "old-roster", snapshotJson: "malformed" }], expected: "stale" },
  ])("returns no snapshot when $name", async ({ rows, expected }) => {
    const manager = createManager(rows)
    const state = await readTransportConfirmation(manager, "session")
    expect(state.status).toBe(expected)
    expect(state.snapshot).toBeNull()
  })

  it("reads stored names and type without replacing missing historical metadata from live travelers", async () => {
    const manager = createManager([{ id: "confirmation", planVersion: 2, currentPlanVersion: 2, rosterVersion: "roster",
      snapshotJson: JSON.stringify({ vehicles: [{ id: "v1", sequence: 1, contactSnapshot: { teacherName: "教师甲", teacherPhone: "13300000000" } }],
        assignments: [{ personRef: "paid:one", vehicleId: "v1", displayName: "确认姓名" }] }),
    }])
    const state = await readTransportConfirmation(manager, "session")
    expect(state.status).toBe("current")
    expect(state.snapshot?.assignments).toEqual([{ personRef: "paid:one", vehicleId: "v1", displayName: "确认姓名",
      participantKind: null, importedRole: null, className: null, gradeName: null, schoolName: null }])
    expect(state.snapshot?.vehicles[0]).toMatchObject({ teacherName: "教师甲", teacherPhone: "13300000000" })
  })

  it("excludes explicitly inactive and conflicted assignments while retaining historical assignments without active", async () => {
    const manager = createManager([{ id: "confirmation", planVersion: 2, currentPlanVersion: 2, rosterVersion: "roster", snapshotJson: {
      vehicles: [], assignments: [
        { personRef: "paid:keep", vehicleId: "v1" },
        { personRef: "paid:cancelled", vehicleId: "v1", active: false },
        { personRef: "paid:conflict", vehicleId: "v1", active: true, conflict: { code: "identity_fields_conflict" } },
      ],
    } }])
    const state = await readTransportConfirmation(manager, "session")
    expect(state.snapshot?.assignments.map(person => person.personRef)).toEqual(["paid:keep"])
  })
})

function createManager(rows: readonly unknown[]) {
  const manager = new DataSource({ type: "mysql" }).manager
  vi.spyOn(manager, "query").mockResolvedValue(rows)
  vi.spyOn(travelers, "readTravelers").mockResolvedValue({ tourSessionId: "session", organizationId: "school",
    rosterVersion: "roster", travelers: [], sources: [], activeCount: 0, inactiveCount: 0, conflictCount: 0 })
  return manager
}
