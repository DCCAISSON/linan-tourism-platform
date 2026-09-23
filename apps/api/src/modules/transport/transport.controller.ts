import { Body, Controller, Get, Headers, Inject, Param, Post, Put, Res } from "@nestjs/common"
import type { Response } from "express"
import { DevStaffAccessService } from "../iam/dev-staff-access.service.js"
import type { PersonRef } from "../travelers/travelers.types.js"
import { TransportPeopleService } from "./transport-people.service.js"
import { createTransportWorkbook } from "./transport.workbook.js"
import { TransportService } from "./transport.service.js"
import { malformedTransportInput } from "./transport.errors.js"
import type {
  TransportAllocationInput,
  TransportConfirmationInput,
  TransportPeoplePlanResponse,
  TransportPersonAssignmentInput,
  TransportPersonAssignmentsInput,
  TransportPlanInput,
  TransportPlanResponse,
  TransportSuggestionInput,
  TransportSuggestionResponse,
  TransportVehicleInput,
} from "./transport.types.js"
import type { TransportContactSnapshot } from "../../domain/entities/transport-session-vehicle.entity.js"

type RequestHeaders = Record<string, string | readonly string[] | undefined>

const INTEGER_FIELD_LABELS: Record<string, string> = {
  sequence: "车号",
  seatCapacity: "座位数",
  studentCount: "学生人数",
  guardianCount: "家长人数",
  teacherCount: "老师人数",
  otherCount: "其他人数",
} as const

@Controller("transport")
export class TransportController {
	  constructor(
	    @Inject(TransportService) private readonly transport: TransportService,
	    @Inject(TransportPeopleService) private readonly transportPeople: TransportPeopleService,
	    @Inject(DevStaffAccessService) private readonly staffAccess: DevStaffAccessService,
	  ) {}

  @Get("sessions/:tourSessionId/plan")
  async readPlan(@Headers() headers: RequestHeaders, @Param("tourSessionId") tourSessionId: string): Promise<TransportPlanResponse> {
    return this.transport.readPlan(await this.staffAccess.resolve(headers), tourSessionId)
  }

	  @Put("sessions/:tourSessionId/plan")
  async savePlan(
    @Headers() headers: RequestHeaders,
    @Param("tourSessionId") tourSessionId: string,
    @Body() body: unknown,
  ): Promise<TransportPlanResponse> {
    this.staffAccess.assertUnsafeOrigin(headers)
    return this.transport.savePlan(await this.staffAccess.resolve(headers), tourSessionId, parsePlanInput(body))
	  }

	  @Get("sessions/:tourSessionId/people-plan")
	  async readPeoplePlan(@Headers() headers: RequestHeaders, @Param("tourSessionId") tourSessionId: string): Promise<TransportPeoplePlanResponse> {
	    return this.transportPeople.readPeoplePlan(await this.staffAccess.resolve(headers), tourSessionId)
	  }

	  @Put("sessions/:tourSessionId/person-allocations")
	  async savePersonAllocations(
	    @Headers() headers: RequestHeaders,
	    @Param("tourSessionId") tourSessionId: string,
	    @Body() body: unknown,
	  ): Promise<TransportPeoplePlanResponse> {
	    this.staffAccess.assertUnsafeOrigin(headers)
	    return this.transportPeople.saveAssignments(await this.staffAccess.resolve(headers), tourSessionId, parseAssignmentsInput(body))
	  }

	  @Post("sessions/:tourSessionId/confirmations")
	  async confirmPlan(
	    @Headers() headers: RequestHeaders,
	    @Param("tourSessionId") tourSessionId: string,
	    @Body() body: unknown,
	  ): Promise<TransportPeoplePlanResponse> {
	    this.staffAccess.assertUnsafeOrigin(headers)
	    return this.transportPeople.confirmPlan(await this.staffAccess.resolve(headers), tourSessionId, parseConfirmationInput(body))
	  }

	  @Post("sessions/:tourSessionId/suggestions")
	  async suggestPlan(
	    @Headers() headers: RequestHeaders,
	    @Param("tourSessionId") tourSessionId: string,
	    @Body() body: unknown,
	  ): Promise<TransportSuggestionResponse> {
	    this.staffAccess.assertUnsafeOrigin(headers)
	    return this.transportPeople.suggestPlan(await this.staffAccess.resolve(headers), tourSessionId, parseSuggestionInput(body))
	  }

  @Get("sessions/:tourSessionId/export.xlsx")
  async exportPlan(
    @Headers() headers: RequestHeaders,
    @Param("tourSessionId") tourSessionId: string,
    @Res() response: Response,
  ): Promise<void> {
    const plan = await this.transport.exportPlan(await this.staffAccess.resolve(headers), tourSessionId)
    const workbook = await createTransportWorkbook(plan)
    response
      .status(200)
      .setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .setHeader("Content-Disposition", 'attachment; filename="transport-contact-sheet.xlsx"')
      .send(workbook)
  }
}

function parsePlanInput(value: unknown): TransportPlanInput {
  const record = readRecord(value, "车辆安排")
  const vehicles = record["vehicles"]
  if (!Array.isArray(vehicles)) {
    throw malformedTransportInput("车辆安排必须包含车辆列表")
  }
  return { vehicles: vehicles.map(parseVehicle) }
}

function parseAssignmentsInput(value: unknown): TransportPersonAssignmentsInput {
  const record = readRecord(value, "人员分配")
  const assignments = record["assignments"]
  if (!Array.isArray(assignments)) throw malformedTransportInput("人员分配必须包含 assignments 列表")
  return {
    expectedPlanVersion: readInteger(record, "expectedPlanVersion"),
    expectedRosterVersion: readText(record, "expectedRosterVersion", 128),
    assignments: assignments.map(parsePersonAssignment),
  }
}

function parseConfirmationInput(value: unknown): TransportConfirmationInput {
  const record = readRecord(value, "确认版本")
  return {
    expectedPlanVersion: readInteger(record, "expectedPlanVersion"),
    expectedRosterVersion: readText(record, "expectedRosterVersion", 128),
  }
}

function parseSuggestionInput(value: unknown): Omit<TransportSuggestionInput, "travelers"> {
  const record = readRecord(value, "规则建议")
  return {
    availableSeatsBySequence: readNumberRecord(record["availableSeatsBySequence"], "可用座位"),
    reservedSeatsBySequence: readNumberRecord(record["reservedSeatsBySequence"], "预留座位"),
    staffSeatsBySequence: readNumberRecord(record["staffSeatsBySequence"], "教师导游占位"),
    keepFamilyTogether: readBoolean(record, "keepFamilyTogether"),
    allowClassSplit: readBoolean(record, "allowClassSplit"),
  }
}

function parsePersonAssignment(value: unknown): TransportPersonAssignmentInput {
  const record = readRecord(value, "人员分配项")
  return {
    personRef: readPersonRef(record, "personRef"),
    vehicleId: readText(record, "vehicleId", 64),
  }
}

function parseVehicle(value: unknown): TransportVehicleInput {
  const record = readRecord(value, "车辆")
  const allocations = record["allocations"]
  if (!Array.isArray(allocations)) {
    throw malformedTransportInput("车辆必须包含班级安排")
  }
  return {
    sequence: readInteger(record, "sequence"),
    seatCapacity: readInteger(record, "seatCapacity"),
    plateNumber: readOptionalText(record, "plateNumber", 64),
    contactSnapshot: parseContactSnapshot(record["contactSnapshot"]),
    allocations: allocations.map(parseAllocation),
  }
}

function parseAllocation(value: unknown): TransportAllocationInput {
  const record = readRecord(value, "班级安排")
  return {
    classId: readText(record, "classId", 64),
    studentCount: readInteger(record, "studentCount"),
    guardianCount: readInteger(record, "guardianCount"),
    teacherCount: readInteger(record, "teacherCount"),
    otherCount: readInteger(record, "otherCount"),
    note: readOptionalText(record, "note", 255),
  }
}

function parseContactSnapshot(value: unknown): TransportContactSnapshot {
  const record = readRecord(value, "联系人")
  return {
    driverName: readOptionalText(record, "driverName", 120),
    driverPhone: readOptionalText(record, "driverPhone", 32),
    guideName: readOptionalText(record, "guideName", 120),
    guidePhone: readOptionalText(record, "guidePhone", 32),
    teacherName: readOptionalText(record, "teacherName", 120),
    teacherPhone: readOptionalText(record, "teacherPhone", 32),
  }
}

function readRecord(value: unknown, itemName: string): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value))
  }
  throw malformedTransportInput(`${itemName}必须是对象`)
}

function readText(record: Record<string, unknown>, key: string, maxLength: number): string {
  const value = readOptionalText(record, key, maxLength)
  if (value.length === 0) {
    throw malformedTransportInput(key === "classId" ? "班级不能为空" : `${key}不能为空`)
  }
  return value
}

function readOptionalText(record: Record<string, unknown>, key: string, maxLength: number): string {
  const value = record[key]
  if (value === undefined || value === null) {
    return ""
  }
  if (typeof value !== "string" || value.length > maxLength) {
    throw malformedTransportInput(`${key}必须是不超过${maxLength}个字符的文本`)
  }
  return value.trim()
}

function readInteger(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  if (typeof value === "number" && Number.isInteger(value)) {
    return value
  }
	  throw malformedTransportInput(`${INTEGER_FIELD_LABELS[key] ?? key}必须是整数`)
	}

function readPersonRef(record: Record<string, unknown>, key: string): PersonRef {
  const value = readText(record, key, 128)
  if (isPersonRef(value)) return value
  throw malformedTransportInput("人员引用格式不正确")
}

function isPersonRef(value: string): value is PersonRef {
  return value.startsWith("paid:") || value.startsWith("imported:")
}

function readBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key]
  if (typeof value === "boolean") return value
  throw malformedTransportInput(`${key}必须是布尔值`)
}

function readNumberRecord(value: unknown, itemName: string): Readonly<Record<number, number>> {
  const record = readRecord(value, itemName)
  const parsed: Record<number, number> = {}
  for (const [key, item] of Object.entries(record)) {
    const sequence = Number(key)
    if (!Number.isInteger(sequence) || typeof item !== "number" || !Number.isInteger(item) || item < 0) {
      throw malformedTransportInput(`${itemName}必须使用车号到非负整数的映射`)
    }
    parsed[sequence] = item
  }
  return parsed
}
