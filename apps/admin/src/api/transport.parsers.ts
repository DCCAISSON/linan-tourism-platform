import { ApiError } from "./configuration.errors"
import type { TransportAllocation, TransportContactSnapshot, TransportPlan, TransportVehicle } from "./transport.types"

export function parseTransportPlan(value: unknown): TransportPlan {
  const record = readRecord(value, "车辆安排")
  const vehicles = readArray(record, "vehicles", "车辆安排")
  const warnings = readArray(record, "warnings", "车辆安排")
  return {
    tourSessionId: readString(record, "tourSessionId", "车辆安排"),
    organizationId: readString(record, "organizationId", "车辆安排"),
    vehicles: vehicles.map(parseVehicle),
    totals: parseTotals(record["totals"]),
    warnings: warnings.map((item) => readDirectString(item, "车辆安排.warnings")),
  }
}

function parseVehicle(value: unknown): TransportVehicle {
  const record = readRecord(value, "车辆")
  const allocations = readArray(record, "allocations", "车辆")
  const warnings = readArray(record, "warnings", "车辆")
  return {
    id: readString(record, "id", "车辆"),
    sequence: readNumber(record, "sequence", "车辆"),
    seatCapacity: readNumber(record, "seatCapacity", "车辆"),
    plateNumber: readString(record, "plateNumber", "车辆"),
    contactSnapshot: parseContact(record["contactSnapshot"]),
    allocations: allocations.map(parseAllocation),
    occupancy: readNumber(record, "occupancy", "车辆"),
    remainingSeats: readNumber(record, "remainingSeats", "车辆"),
    warnings: warnings.map((item) => readDirectString(item, "车辆.warnings")),
  }
}

function parseAllocation(value: unknown): TransportAllocation {
  const record = readRecord(value, "班级安排")
  return {
    id: readString(record, "id", "班级安排"),
    classId: readString(record, "classId", "班级安排"),
    className: readString(record, "className", "班级安排"),
    gradeName: readString(record, "gradeName", "班级安排"),
    studentCount: readNumber(record, "studentCount", "班级安排"),
    guardianCount: readNumber(record, "guardianCount", "班级安排"),
    teacherCount: readNumber(record, "teacherCount", "班级安排"),
    otherCount: readNumber(record, "otherCount", "班级安排"),
    note: readString(record, "note", "班级安排"),
    occupancy: readNumber(record, "occupancy", "班级安排"),
  }
}

function parseContact(value: unknown): TransportContactSnapshot {
  const record = readRecord(value, "联系人")
  return {
    driverName: readString(record, "driverName", "联系人"),
    driverPhone: readString(record, "driverPhone", "联系人"),
    guideName: readString(record, "guideName", "联系人"),
    guidePhone: readString(record, "guidePhone", "联系人"),
    teacherName: readString(record, "teacherName", "联系人"),
    teacherPhone: readString(record, "teacherPhone", "联系人"),
  }
}

function parseTotals(value: unknown): TransportPlan["totals"] {
  const record = readRecord(value, "车辆汇总")
  return {
    studentCount: readNumber(record, "studentCount", "车辆汇总"),
    guardianCount: readNumber(record, "guardianCount", "车辆汇总"),
    teacherCount: readNumber(record, "teacherCount", "车辆汇总"),
    otherCount: readNumber(record, "otherCount", "车辆汇总"),
    occupancy: readNumber(record, "occupancy", "车辆汇总"),
    seatCapacity: readNumber(record, "seatCapacity", "车辆汇总"),
  }
}

function readRecord(value: unknown, itemName: string): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return Object.fromEntries(Object.entries(value))
  throw new ApiError(0, `${itemName}响应格式不正确`)
}

function readArray(record: Record<string, unknown>, key: string, itemName: string): readonly unknown[] {
  const value = record[key]
  if (Array.isArray(value)) return value
  throw new ApiError(0, `${itemName}.${key} 响应格式不正确`)
}

function readString(record: Record<string, unknown>, key: string, itemName: string): string {
  return readDirectString(record[key], `${itemName}.${key}`)
}

function readDirectString(value: unknown, name: string): string {
  if (typeof value === "string") return value
  throw new ApiError(0, `${name} 响应格式不正确`)
}

function readNumber(record: Record<string, unknown>, key: string, itemName: string): number {
  const value = record[key]
  if (typeof value === "number" && Number.isFinite(value)) return value
  throw new ApiError(0, `${itemName}.${key} 响应格式不正确`)
}
