import type { TourSessionEntity } from "../../domain/entities/index.js"
import { malformedTransportInput } from "./transport.errors.js"
import type {
  TransportAllocationInput,
  TransportAllocationRecord,
  TransportAllocationResponse,
  TransportDocumentSnapshot,
  TransportPlanResponse,
  TransportVehicleInput,
  TransportVehicleResponse,
} from "./transport.types.js"

export function validateVehicle(vehicle: TransportVehicleInput, sequences: Set<number>, plates: Set<string>): void {
  if (!Number.isInteger(vehicle.sequence) || vehicle.sequence <= 0) {
    throw malformedTransportInput("车号必须是正整数")
  }
  if (!Number.isInteger(vehicle.seatCapacity) || vehicle.seatCapacity <= 0) {
    throw malformedTransportInput("座位数必须是正整数")
  }
  if (sequences.has(vehicle.sequence)) {
    throw malformedTransportInput(`车号${vehicle.sequence}重复`)
  }
  sequences.add(vehicle.sequence)
  const plate = vehicle.plateNumber.trim()
  if (plate.length > 0 && plates.has(plate)) {
    throw malformedTransportInput(`车牌${plate}重复`)
  }
  if (plate.length > 0) {
    plates.add(plate)
  }
}

export function validateAllocation(allocation: TransportAllocationInput): void {
  const counts = [allocation.studentCount, allocation.guardianCount, allocation.teacherCount, allocation.otherCount]
  if (allocation.classId.trim().length === 0) {
    throw malformedTransportInput("班级不能为空")
  }
  if (counts.some((count) => !Number.isInteger(count) || count < 0)) {
    throw malformedTransportInput("乘车人数必须为非负整数")
  }
}

export function toPlan(session: TourSessionEntity, records: readonly TransportAllocationRecord[], planVersion: number): TransportPlanResponse {
  const vehicles = new Map<string, TransportVehicleResponse>()
  for (const record of records) {
    let vehicle = vehicles.get(record.vehicleId)
    if (vehicle === undefined) {
      vehicle = emptyVehicle(record)
      vehicles.set(record.vehicleId, vehicle)
    }
    if (record.allocationId !== null) {
      const allocations = [...vehicle.allocations, toAllocation(record)]
      const occupancy = allocations.reduce((sum, allocation) => sum + allocation.occupancy, 0)
      vehicles.set(record.vehicleId, withVehicleTotals(vehicle, allocations, occupancy))
    }
  }
  const vehicleList = [...vehicles.values()].sort((left, right) => left.sequence - right.sequence)
  return {
    tourSessionId: session.id,
    organizationId: session.organizationId,
    planVersion,
    vehicles: vehicleList,
    totals: totalVehicles(vehicleList),
    warnings: vehicleList.flatMap((vehicle) => vehicle.warnings),
  }
}

function emptyVehicle(record: TransportAllocationRecord): TransportVehicleResponse {
  return withVehicleTotals({
    id: record.vehicleId,
    sequence: readNumber(record.sequence),
    seatCapacity: readNumber(record.seatCapacity),
    plateNumber: record.plateNumber ?? "",
    contactSnapshot: readContactSnapshot(record.contactSnapshotJson),
    allocations: [],
    occupancy: 0,
    remainingSeats: readNumber(record.seatCapacity),
    warnings: [],
  }, [], 0)
}

function toAllocation(record: TransportAllocationRecord): TransportAllocationResponse {
  const counts = {
    studentCount: readNumber(record.studentCount),
    guardianCount: readNumber(record.guardianCount),
    teacherCount: readNumber(record.teacherCount),
    otherCount: readNumber(record.otherCount),
  }
  if (record.allocationId === null || record.classId === null || record.className === null || record.gradeName === null) {
    throw malformedTransportInput("班级安排信息不完整")
  }
  return {
    id: record.allocationId,
    classId: record.classId,
    className: record.className,
    gradeName: record.gradeName,
    ...counts,
    note: record.note ?? "",
    occupancy: counts.studentCount + counts.guardianCount + counts.teacherCount + counts.otherCount,
  }
}

function withVehicleTotals(
  vehicle: TransportVehicleResponse,
  allocations: readonly TransportAllocationResponse[],
  occupancy: number,
): TransportVehicleResponse {
  const remainingSeats = vehicle.seatCapacity - occupancy
  return {
    ...vehicle,
    allocations,
    occupancy,
    remainingSeats,
    warnings: remainingSeats > 0 ? [`${vehicle.sequence}号车未满载：容量${vehicle.seatCapacity}人，已安排${occupancy}人`] : [],
  }
}

function totalVehicles(vehicles: readonly TransportVehicleResponse[]): TransportPlanResponse["totals"] {
  return vehicles.reduce((total, vehicle) => ({
    studentCount: total.studentCount + sumAllocations(vehicle, "studentCount"),
    guardianCount: total.guardianCount + sumAllocations(vehicle, "guardianCount"),
    teacherCount: total.teacherCount + sumAllocations(vehicle, "teacherCount"),
    otherCount: total.otherCount + sumAllocations(vehicle, "otherCount"),
    occupancy: total.occupancy + vehicle.occupancy,
    seatCapacity: total.seatCapacity + vehicle.seatCapacity,
  }), { studentCount: 0, guardianCount: 0, teacherCount: 0, otherCount: 0, occupancy: 0, seatCapacity: 0 })
}

function sumAllocations(vehicle: TransportVehicleResponse, key: "studentCount" | "guardianCount" | "teacherCount" | "otherCount"): number {
  return vehicle.allocations.reduce((sum, allocation) => sum + allocation[key], 0)
}

export function vehicleOccupancy(vehicle: TransportVehicleInput): number {
  return vehicle.allocations.reduce((sum, allocation) => sum + allocation.studentCount + allocation.guardianCount + allocation.teacherCount + allocation.otherCount, 0)
}

export function hasContactValue(vehicle: TransportVehicleInput | TransportVehicleResponse): boolean {
  return Object.values(vehicle.contactSnapshot).some((value) => value.trim().length > 0)
}

export function hasDocumentContact(document: TransportDocumentSnapshot | null | undefined): boolean {
  return document != null && [document.guideLeaderName, document.guideLeaderPhone, document.schoolLeaderName, document.schoolLeaderPhone].some(value => value.trim().length > 0)
}

export function redactContactSnapshots(plan: TransportPlanResponse): TransportPlanResponse {
  return {
    ...plan,
    documentSnapshot: plan.documentSnapshot == null ? null : { ...plan.documentSnapshot, guideLeaderName: "", guideLeaderPhone: "", schoolLeaderName: "", schoolLeaderPhone: "" },
    vehicles: plan.vehicles.map((vehicle) => ({
      ...vehicle,
      contactSnapshot: { driverName: "", driverPhone: "", guideName: "", guidePhone: "", teacherName: "", teacherPhone: "" },
    })),
  }
}

export function sessionScope(session: TourSessionEntity) {
  return { schoolId: session.organizationId, requestedSchoolId: session.organizationId, requestedClassId: null, tourSessionId: session.id }
}

export function textOrNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

function readNumber(value: number | string): number {
  return Number(value)
}

function readContactSnapshot(value: TransportAllocationRecord["contactSnapshotJson"]): TransportVehicleResponse["contactSnapshot"] {
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw malformedTransportInput("联系人信息格式不正确")
  }
  return {
    driverName: readContactText(parsed, "driverName"),
    driverPhone: readContactText(parsed, "driverPhone"),
    guideName: readContactText(parsed, "guideName"),
    guidePhone: readContactText(parsed, "guidePhone"),
    teacherName: readContactText(parsed, "teacherName"),
    teacherPhone: readContactText(parsed, "teacherPhone"),
  }
}

function readContactText(record: object, key: keyof TransportVehicleResponse["contactSnapshot"]): string {
  for (const [name, value] of Object.entries(record)) {
    if (name === key && typeof value === "string") {
      return value
    }
  }
  return ""
}
