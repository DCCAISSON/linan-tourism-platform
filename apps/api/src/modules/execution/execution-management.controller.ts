import { Body, Controller, Get, Headers, Inject, Param, Post, Res } from "@nestjs/common"
import type { Response } from "express"
import { StaffAccountEntity } from "../../domain/entities/staff-account.entity.js"
import type { ExecutionGuideAssignmentEntity } from "../../domain/entities/execution-guide-assignment.entity.js"
import { DevStaffAccessService } from "../iam/dev-staff-access.service.js"
import { ExecutionManagementService } from "./execution-management.service.js"
import { ExecutionGuideAssignmentService } from "./execution-guide-assignment.service.js"
import { createExecutionWorkbook } from "./execution-management.workbook.js"
import { parseAssignmentReason, parseGuideAssignment } from "./execution.parser.js"

type RequestHeaders = Record<string, string | readonly string[] | undefined>

@Controller("staff/execution/management")
export class ExecutionManagementController {
  constructor(
    @Inject(DevStaffAccessService) private readonly staff: DevStaffAccessService,
    @Inject(ExecutionManagementService) private readonly management: ExecutionManagementService,
    @Inject(ExecutionGuideAssignmentService) private readonly assignments: ExecutionGuideAssignmentService,
  ) {}

  @Get("sessions")
  async sessions(@Headers() headers: RequestHeaders) { return this.management.listSessions(await this.staff.resolve(headers)) }

  @Get("sessions/:sessionId")
  async detail(@Headers() headers: RequestHeaders, @Param("sessionId") sessionId: string) { return this.management.detail(await this.staff.resolve(headers), sessionId) }

  @Get("sessions/:sessionId/assignment-candidates")
  async candidates(@Headers() headers: RequestHeaders, @Param("sessionId") sessionId: string) {
    const access = await this.staff.resolve(headers)
    await this.management.assertManager(access)
    return this.assignments.candidates(access, sessionId)
  }

  @Get("sessions/:sessionId/assignments")
  async listAssignments(@Headers() headers: RequestHeaders, @Param("sessionId") sessionId: string) {
    const access = await this.staff.resolve(headers)
    const manager = await this.management.assertManager(access)
    const rows = await this.assignments.list(access, sessionId)
    return Promise.all(rows.map(async row => assignmentResponse(row, (await manager.findOneBy(StaffAccountEntity, { id: row.staffAccountId }))?.displayName ?? "")))
  }

  @Post("sessions/:sessionId/assignments")
  async assign(@Headers() headers: RequestHeaders, @Param("sessionId") sessionId: string, @Body() body: unknown) {
    this.staff.assertUnsafeOrigin(headers)
    const access = await this.staff.resolve(headers)
    const manager = await this.management.assertManager(access)
    const row = await this.assignments.assign(access, parseGuideAssignment(body, sessionId))
    return assignmentResponse(row, (await manager.findOneBy(StaffAccountEntity, { id: row.staffAccountId }))?.displayName ?? "")
  }

  @Post("assignments/:assignmentId/revoke")
  async revoke(@Headers() headers: RequestHeaders, @Param("assignmentId") assignmentId: string, @Body() body: unknown) {
    this.staff.assertUnsafeOrigin(headers)
    const access = await this.staff.resolve(headers)
    const manager = await this.management.assertManager(access)
    const row = await this.assignments.revoke(access, assignmentId, parseAssignmentReason(body))
    return assignmentResponse(row, (await manager.findOneBy(StaffAccountEntity, { id: row.staffAccountId }))?.displayName ?? "")
  }

  @Get("sessions/:sessionId/export.xlsx")
  async export(@Headers() headers: RequestHeaders, @Param("sessionId") sessionId: string, @Res() response: Response): Promise<void> {
    const detail = await this.management.exportDetail(await this.staff.resolve(headers), sessionId)
    response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    response.setHeader("Content-Disposition", 'attachment; filename="execution-records.xlsx"')
    response.send(await createExecutionWorkbook(detail))
  }
}

function assignmentResponse(row: ExecutionGuideAssignmentEntity, displayName: string) {
  return { id: row.id, staffAccountId: row.staffAccountId, displayName, tourSessionId: row.tourSessionId, vehicleId: row.vehicleId, active: row.active, version: row.version, reason: row.reason, updatedAt: row.updatedAt.toISOString() }
}
