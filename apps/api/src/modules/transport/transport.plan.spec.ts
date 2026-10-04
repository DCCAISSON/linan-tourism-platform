import { describe, expect, it } from "vitest"
import { TourSessionEntity } from "../../domain/entities/tour-session.entity.js"
import { toPlan } from "./transport.plan.js"
import type { TransportAllocationRecord } from "./transport.types.js"

describe("transport plan warnings", () => {
  it("only returns warnings derived from the current vehicle plan", () => {
    // Given
    const session = new TourSessionEntity()
    session.id = "session-a"
    session.organizationId = "org-a"
    const records: readonly TransportAllocationRecord[] = [
      {
        allocationId: "allocation-a",
        vehicleId: "vehicle-a",
        sequence: 1,
        seatCapacity: 4,
        plateNumber: "浙A12345",
        contactSnapshotJson: {
          driverName: "司机甲",
          driverPhone: "13800000000",
          guideName: "导游甲",
          guidePhone: "13800000001",
          teacherName: "老师甲",
          teacherPhone: "13800000002",
        },
        classId: "class-a",
        className: "一班",
        gradeName: "五年级",
        studentCount: 1,
        guardianCount: 0,
        teacherCount: 0,
        otherCount: 0,
        note: null,
      },
    ]

    // When
    const plan = toPlan(session, records, 1)

    // Then
    expect(plan.warnings).toEqual(["1号车未满载：容量4人，已安排1人"])
  })
})
