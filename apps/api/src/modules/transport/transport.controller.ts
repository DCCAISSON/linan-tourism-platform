import { Body, Controller, Get, Headers, Inject, Param, Put, Res } from "@nestjs/common"
import type { Response } from "express"
import { DevStaffAccessService } from "../iam/dev-staff-access.service.js"
import { createTransportWorkbook } from "./transport.workbook.js"
import { TransportService } from "./transport.service.js"
import { malformedTransportInput } from "./transport.errors.js"
import type { TransportAllocationInput, TransportPlanInput, TransportPlanResponse, TransportVehicleInput } from "./transport.types.js"
import type { TransportContactSnapshot } from "../../domain/entities/transport-session-vehicle.entity.js"

type RequestHeaders = Record<string, string | readonly string[] | undefined>

@Controller("transport")
export class TransportController {
  constructor(
    @Inject(TransportService) private readonly transport: TransportService,
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
      .setHeader("Content-Disposition", "attachment; filename=\"transport-contact-sheet.xlsx\"")
      .send(workbook)
  }
}

function parsePlanInput(value: unknown): TransportPlanInput {
  const record = readRecord(value, "车辆安排")
  const vehicles = record["vehicles"]
  if (!Array.isArray(vehicles)) {
    throw malformedTransportInput("vehicles must be an array")
  }
  return { vehicles: vehicles.map(parseVehicle) }
}

function parseVehicle(value: unknown): TransportVehicleInput {
  const record = readRecord(value, "车辆")
  const allocations = record["allocations"]
  if (!Array.isArray(allocations)) {
    throw malformedTransportInput("allocations must be an array")
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
    throw malformedTransportInput(`${key} must be a non-empty string`)
  }
  return value
}

function readOptionalText(record: Record<string, unknown>, key: string, maxLength: number): string {
  const value = record[key]
  if (value === undefined || value === null) {
    return ""
  }
  if (typeof value !== "string" || value.length > maxLength) {
    throw malformedTransportInput(`${key} must be a string of at most ${maxLength} characters`)
  }
  return value.trim()
}

function readInteger(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  if (typeof value === "number" && Number.isInteger(value)) {
    return value
  }
  throw malformedTransportInput(`${key} must be an integer`)
}
