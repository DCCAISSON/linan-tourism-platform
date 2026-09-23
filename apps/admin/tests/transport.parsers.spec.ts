import { describe, expect, it } from "vitest"
import { ApiError } from "@/api/configuration.errors"
import { parseTransportPeoplePlan, parseTransportPlan, parseTransportSuggestion } from "@/api/transport.parsers"

const validPlan = {
  tourSessionId: "session-demo",
  organizationId: "school-demo",
  planVersion: 2,
  vehicles: [{
    id: "vehicle-1",
    sequence: 1,
    seatCapacity: 3,
    plateNumber: "",
    contactSnapshot: {
      driverName: "",
      driverPhone: "",
      guideName: "",
      guidePhone: "",
      teacherName: "",
      teacherPhone: "",
    },
    allocations: [{
      id: "allocation-1",
      classId: "class-1",
      className: "一班",
      gradeName: "三年级",
      studentCount: 2,
      guardianCount: 1,
      teacherCount: 0,
      otherCount: 0,
      note: "",
      occupancy: 3,
    }],
    occupancy: 3,
    remainingSeats: 0,
    warnings: [],
  }],
  totals: {
    studentCount: 2,
    guardianCount: 1,
    teacherCount: 0,
    otherCount: 0,
    occupancy: 3,
    seatCapacity: 3,
  },
  warnings: ["样表合计488人与需求口径492人存在差异"],
} as const

describe("transport response boundary", () => {
  it("keeps totals, warnings, and allocation counts when the response is valid", () => {
    const parsed = parseTransportPlan(validPlan)

	    expect(parsed.totals.occupancy).toBe(3)
    expect(parsed.planVersion).toBe(2)
	    expect(parsed.vehicles[0]?.allocations[0]?.className).toBe("一班")
    expect(parsed.warnings[0]).toContain("488")
	  })

  it("parses people plan versions, actual occupancy, and stale confirmation", () => {
    const parsed = parseTransportPeoplePlan({
      ...validPlan,
      rosterVersion: "roster-v1",
      vehicles: [{ ...validPlan.vehicles[0], estimatedOccupancy: 3, actualOccupancy: 2, actualRemainingSeats: 1 }],
      assignments: [{
        personRef: "paid:line-1",
        vehicleId: "vehicle-1",
        displayName: "学生一",
        className: "一班",
        importedRole: null,
        active: true,
        conflict: null,
      }],
      unassigned: [],
      conflicts: [],
      confirmation: {
        id: "confirmation-1",
        planVersion: 1,
        rosterVersion: "roster-old",
        status: "stale",
        confirmedAt: "2026-09-23T01:00:00.000Z",
        confirmedBy: "staff-1",
      },
    })

    expect(parsed.vehicles[0]?.actualOccupancy).toBe(2)
    expect(parsed.assignments[0]?.personRef).toBe("paid:line-1")
    expect(parsed.confirmation?.status).toBe("stale")
  })

  it("parses explicit rule suggestions without treating them as confirmation", () => {
    const parsed = parseTransportSuggestion({
      kind: "draft",
      assignments: [{ personRef: "imported:teacher-1", sequence: 1 }],
      explanations: ["1号车可用座位4，预留1，教师/导游占位1，实际可分配2。"],
      conflicts: [],
    })

    expect(parsed.kind).toBe("draft")
    expect(parsed.assignments[0]?.sequence).toBe(1)
  })

  it("rejects nonnumeric capacity instead of coercing server responses", () => {
    const response = {
      ...validPlan,
      vehicles: [{ ...validPlan.vehicles[0], seatCapacity: "3" }],
    }

    expect(() => parseTransportPlan(response)).toThrow(ApiError)
  })
})
