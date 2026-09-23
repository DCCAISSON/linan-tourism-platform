import { ApiError } from "./configuration.errors"
import type {
  PersonRef,
  TransportAllocation,
  TransportAssignment,
  TransportConfirmation,
  TransportContactSnapshot,
  TransportPeoplePlan,
  TransportPeopleVehicle,
  TransportPlan,
  TransportSuggestion,
  TransportTraveler,
  TransportVehicle,
} from "./transport.types"

export function parseTransportPlan(value: unknown): TransportPlan {
  const record = readRecord(value, "车辆安排")
  const vehicles = readArray(record, "vehicles", "车辆安排")
  const warnings = readArray(record, "warnings", "车辆安排")
  return {
    tourSessionId: readString(record, "tourSessionId", "车辆安排"),
    organizationId: readString(record, "organizationId", "车辆安排"),
    planVersion: readNumber(record, "planVersion", "车辆安排"),
    vehicles: vehicles.map(parseVehicle),
    totals: parseTotals(record["totals"]),
    warnings: warnings.map((item) => readDirectString(item, "车辆安排.warnings")),
  }
}

export function parseTransportPeoplePlan(value: unknown): TransportPeoplePlan {
  const record = readRecord(value, "人员车辆计划")
  const vehicles = readArray(record, "vehicles", "人员车辆计划")
  const assignments = readArray(record, "assignments", "人员车辆计划")
  const unassigned = readArray(record, "unassigned", "人员车辆计划")
  const conflicts = readArray(record, "conflicts", "人员车辆计划")
  return {
    tourSessionId: readString(record, "tourSessionId", "人员车辆计划"),
    organizationId: readString(record, "organizationId", "人员车辆计划"),
    planVersion: readNumber(record, "planVersion", "人员车辆计划"),
    rosterVersion: readString(record, "rosterVersion", "人员车辆计划"),
    vehicles: vehicles.map(parsePeopleVehicle),
    assignments: assignments.map(parseAssignment),
    unassigned: unassigned.map(parseTraveler),
    conflicts: conflicts.map(parseTraveler),
    confirmation: parseConfirmation(record["confirmation"]),
  }
}

export function parseTransportSuggestion(value: unknown): TransportSuggestion {
  const record = readRecord(value, "规则建议")
  const assignments = readArray(record, "assignments", "规则建议")
  const explanations = readArray(record, "explanations", "规则建议")
  const conflicts = readArray(record, "conflicts", "规则建议")
  return {
    kind: readSuggestionKind(record, "kind"),
    assignments: assignments.map(parseSuggestedAssignment),
    explanations: explanations.map((item) => readDirectString(item, "规则建议.explanations")),
    conflicts: conflicts.map((item) => readDirectString(item, "规则建议.conflicts")),
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

function parsePeopleVehicle(value: unknown): TransportPeopleVehicle {
  const record = readRecord(value, "人员车辆")
  return {
    ...parseVehicle(value),
    estimatedOccupancy: readNumber(record, "estimatedOccupancy", "人员车辆"),
    actualOccupancy: readNumber(record, "actualOccupancy", "人员车辆"),
    actualRemainingSeats: readNumber(record, "actualRemainingSeats", "人员车辆"),
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

function parseAssignment(value: unknown): TransportAssignment {
  const record = readRecord(value, "人员分配")
  return {
    personRef: readPersonRef(record, "personRef", "人员分配"),
    vehicleId: readString(record, "vehicleId", "人员分配"),
    displayName: readString(record, "displayName", "人员分配"),
    className: readNullableString(record, "className", "人员分配"),
    importedRole: readImportedRole(record, "importedRole"),
    active: readBoolean(record, "active", "人员分配"),
    conflict: parseAssignmentConflict(record["conflict"]),
  }
}

function parseTraveler(value: unknown): TransportTraveler {
  const record = readRecord(value, "出行人员")
  return {
    personRef: readPersonRef(record, "personRef", "出行人员"),
    displayName: readString(record, "displayName", "出行人员"),
    className: readNullableString(record, "className", "出行人员"),
    importedRole: readImportedRole(record, "importedRole"),
    active: readBoolean(record, "active", "出行人员"),
  }
}

function parseConfirmation(value: unknown): TransportConfirmation | null {
  if (value === null) return null
  const record = readRecord(value, "车辆确认")
  return {
    id: readString(record, "id", "车辆确认"),
    planVersion: readNumber(record, "planVersion", "车辆确认"),
    rosterVersion: readString(record, "rosterVersion", "车辆确认"),
    status: readConfirmationStatus(record, "status"),
    confirmedAt: readString(record, "confirmedAt", "车辆确认"),
    confirmedBy: readString(record, "confirmedBy", "车辆确认"),
  }
}

function parseSuggestedAssignment(value: unknown): TransportSuggestion["assignments"][number] {
  const record = readRecord(value, "建议分配")
  return {
    personRef: readPersonRef(record, "personRef", "建议分配"),
    sequence: readNumber(record, "sequence", "建议分配"),
  }
}

function parseAssignmentConflict(value: unknown): TransportAssignment["conflict"] {
  if (value === null) return null
  const record = readRecord(value, "人员分配冲突")
  const sourceRefs = readArray(record, "sourceRefs", "人员分配冲突")
  return {
    code: readString(record, "code", "人员分配冲突"),
    sourceRefs: sourceRefs.map((item) => {
      const sourceRef = readDirectString(item, "人员分配冲突.sourceRefs")
      if (isPersonRef(sourceRef)) return sourceRef
      throw new ApiError(0, "人员分配冲突.sourceRefs 响应格式不正确")
    }),
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

function readBoolean(record: Record<string, unknown>, key: string, itemName: string): boolean {
  const value = record[key]
  if (typeof value === "boolean") return value
  throw new ApiError(0, `${itemName}.${key} 响应格式不正确`)
}

function readNullableString(record: Record<string, unknown>, key: string, itemName: string): string | null {
  const value = record[key]
  if (value === null) return null
  if (typeof value === "string") return value
  throw new ApiError(0, `${itemName}.${key} 响应格式不正确`)
}

function readImportedRole(record: Record<string, unknown>, key: string): TransportTraveler["importedRole"] {
  const value = record[key]
  if (value === null || value === "student" || value === "guardian" || value === "teacher") return value
  throw new ApiError(0, `出行人员.${key} 响应格式不正确`)
}

function readPersonRef(record: Record<string, unknown>, key: string, itemName: string): PersonRef {
  const value = readString(record, key, itemName)
  if (isPersonRef(value)) return value
  throw new ApiError(0, `${itemName}.${key} 响应格式不正确`)
}

function isPersonRef(value: string): value is PersonRef {
  return value.startsWith("paid:") || value.startsWith("imported:")
}

function readConfirmationStatus(record: Record<string, unknown>, key: string): TransportConfirmation["status"] {
  const value = record[key]
  if (value === "current" || value === "stale") return value
  throw new ApiError(0, `车辆确认.${key} 响应格式不正确`)
}

function readSuggestionKind(record: Record<string, unknown>, key: string): TransportSuggestion["kind"] {
  const value = record[key]
  if (value === "draft" || value === "conflict") return value
  throw new ApiError(0, `规则建议.${key} 响应格式不正确`)
}
