import { ConflictException } from "@nestjs/common"
import { describe, expect, it } from "vitest"
import type { TravelerRecord } from "../travelers/travelers.types.js"
import { assertSchoolAdjustmentTraveler, parseTransportSnapshot, updateGatheringCoordinates } from "./pretrip.service.js"
import { PretripConfigEntity } from "../../domain/entities/pretrip-config.entity.js"
import { parsePretripConfig } from "./pretrip.parser.js"

describe("gathering address and coordinates", () => {
  it.each(["same", "changed"])("handles legacy coordinates when the address is %s", (kind) => {
    // Given
    const row = Object.assign(new PretripConfigEntity(), { gatheringPlace: "Gate A", gatheringLatitude: 30.23, gatheringLongitude: 119.72 })
    const input = parsePretripConfig({ gatheringPlace: kind === "same" ? "Gate A" : "Gate B", gatheringAt: null, travelMode: "group", itineraryNote: "Water", contactName: "Operator", contactPhone: "13800000000", serviceContact: "service", expectedVersion: 1, attachments: [] })
    // When
    updateGatheringCoordinates(row, input)
    // Then
    expect([row.gatheringLatitude, row.gatheringLongitude]).toEqual(kind === "same" ? [30.23, 119.72] : [null, null])
  })
})

const session = { id: "session-1", organizationId: "school-1" } as const
const activeTraveler: TravelerRecord = {
  personRef: "paid:line-1",
  sourceRefs: ["paid:line-1"],
  source: "paid",
  tourSessionId: "session-1",
  organizationId: "school-1",
  displayName: "测试学生",
  gradeId: null,
  classId: null,
  gradeName: null,
  className: null,
  participantKind: "student",
  importedRole: null,
  identityMasked: null,
  phoneMasked: null,
  active: true,
  inactiveReason: null,
  eligibility: "paid",
  eligibilityReason: null,
  importVersion: null,
  conflict: null,
  identityHash: null,
  phoneHash: null,
  personDataKeyVersion: "v1",
  identityCiphertext: null,
  phoneCiphertext: null,
  familyId: "family-1",
  familyMemberId: "member-1",
  orderId: "order-1",
  orderLineId: "line-1",
  importPersonId: null,
  dedupeKey: "paid:line-1",
}

describe("pretrip school adjustment traveler policy", () => {
  it("allows active travelers from the same school session", () => {
    expect(() => assertSchoolAdjustmentTraveler(session, activeTraveler)).not.toThrow()
  })

  it("rejects travelers from another school or tour session", () => {
    expect(() => assertSchoolAdjustmentTraveler(session, { ...activeTraveler, organizationId: "school-2" })).toThrow(ConflictException)
    expect(() => assertSchoolAdjustmentTraveler(session, { ...activeTraveler, tourSessionId: "session-2" })).toThrow(ConflictException)
  })

  it("rejects inactive or conflicted travelers before an adjustment request is saved", () => {
    expect(() => assertSchoolAdjustmentTraveler(session, { ...activeTraveler, active: false })).toThrow(ConflictException)
    expect(() => assertSchoolAdjustmentTraveler(session, { ...activeTraveler, conflict: { code: "identity_fields_conflict", sourceRefs: ["paid:line-1", "imported:person-1"] } })).toThrow(ConflictException)
  })
})

describe("parseTransportSnapshot", () => {
  const snapshot = {
    vehicles: [{
      id: "vehicle-1",
      sequence: 1,
      plateNumber: "浙A12345",
      contactSnapshot: {
        guideName: "导游甲",
        guidePhone: "13800000000",
        driverName: "司机乙",
        driverPhone: "13900000000",
        teacherName: "随车教师",
        teacherPhone: "13700000000",
      },
    }],
    assignments: [{ personRef: "paid:line-1", vehicleId: "vehicle-1" }],
  } as const

  it("reads a string JSON snapshot from drivers that return raw JSON text", () => {
    expect(parseTransportSnapshot(JSON.stringify(snapshot))).toEqual({
      vehicles: [{
        id: "vehicle-1",
        sequence: 1,
        plateNumber: "浙A12345",
        guideName: "导游甲",
        guidePhone: "13800000000",
        driverName: "司机乙",
        driverPhone: "13900000000",
        teacherName: "随车教师",
        teacherPhone: "13700000000",
      }],
      assignments: [{ personRef: "paid:line-1", vehicleId: "vehicle-1" }],
    })
  })

  it("reads an object snapshot from mysql2 JSON column decoding", () => {
    expect(parseTransportSnapshot(snapshot)).toEqual({
      vehicles: [{
        id: "vehicle-1",
        sequence: 1,
        plateNumber: "浙A12345",
        guideName: "导游甲",
        guidePhone: "13800000000",
        driverName: "司机乙",
        driverPhone: "13900000000",
        teacherName: "随车教师",
        teacherPhone: "13700000000",
      }],
      assignments: [{ personRef: "paid:line-1", vehicleId: "vehicle-1" }],
    })
  })

  it("keeps invalid string snapshots on the JSON.parse failure path", () => {
    expect(() => parseTransportSnapshot("[object Object]")).toThrow(SyntaxError)
  })

  it("leaves teacher contact empty when the historical confirmation never stored it", () => {
    // Given / When
    const result = parseTransportSnapshot({ vehicles: [{ id: "old", contactSnapshot: {} }], assignments: [] })
    // Then
    expect(result.vehicles[0]).toMatchObject({ teacherName: null, teacherPhone: null })
  })
})
