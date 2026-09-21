import { describe, expect, it } from "vitest"
import { ApiError } from "@/api/configuration.errors"
import { parseTransportPlan } from "@/api/transport.parsers"

const validPlan = {
  tourSessionId: "session-demo",
  organizationId: "school-demo",
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
    expect(parsed.vehicles[0]?.allocations[0]?.className).toBe("一班")
    expect(parsed.warnings[0]).toContain("488")
  })

  it("rejects nonnumeric capacity instead of coercing server responses", () => {
    const response = {
      ...validPlan,
      vehicles: [{ ...validPlan.vehicles[0], seatCapacity: "3" }],
    }

    expect(() => parseTransportPlan(response)).toThrow(ApiError)
  })
})
