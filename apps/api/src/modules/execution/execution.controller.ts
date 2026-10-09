import { Body, Controller, Get, Headers, Inject, Param, Post } from "@nestjs/common"
import { EnrollmentIdentityService } from "../enrollment/enrollment.identity.js"
import { DevStaffAccessService } from "../iam/dev-staff-access.service.js"
import {
  parseAttendanceInput, parseDailyReportInput, parseEventInput, parseHealthAuthorization,
  parsePersonRef, parsePublicApproval,
} from "./execution.parser.js"
import { ExecutionService } from "./execution.service.js"
import type {
  AttendanceResponse, DailyReportResponse, EventResponse, FamilyPublicSummary, GuideSessionResponse,
  GuideSessionSummary, HealthAuthorizationResponse, HealthReadResponse,
} from "./execution.types.js"

type RequestHeaders = Record<string, string | readonly string[] | undefined>

@Controller("staff/execution")
export class StaffExecutionController {
  constructor(
    @Inject(DevStaffAccessService) private readonly staffAccess: DevStaffAccessService,
    @Inject(ExecutionService) private readonly execution: ExecutionService,
  ) {}

  @Get("sessions")
  async sessions(@Headers() headers: RequestHeaders): Promise<readonly GuideSessionSummary[]> {
    return this.execution.listGuideSessions(await this.staffAccess.resolve(headers))
  }

  @Get("sessions/:sessionId")
  async session(@Headers() headers: RequestHeaders, @Param("sessionId") sessionId: string): Promise<GuideSessionResponse> {
    return this.execution.guideSession(await this.staffAccess.resolve(headers), sessionId)
  }

  @Post("sessions/:sessionId/people/:personRef/attendance")
  async attendance(@Headers() headers: RequestHeaders, @Param("sessionId") sessionId: string, @Param("personRef") personRef: string, @Body() body: unknown): Promise<AttendanceResponse> {
    return this.execution.saveAttendance(await this.staffAccess.resolveExecutionWrite(headers), sessionId, parsePersonRef(personRef), parseAttendanceInput(body))
  }

  @Post("sessions/:sessionId/daily-reports")
  async dailyReport(@Headers() headers: RequestHeaders, @Param("sessionId") sessionId: string, @Body() body: unknown): Promise<DailyReportResponse> {
    return this.execution.saveDailyReport(await this.staffAccess.resolveExecutionWrite(headers), sessionId, parseDailyReportInput(body))
  }

  @Post("sessions/:sessionId/events")
  async event(@Headers() headers: RequestHeaders, @Param("sessionId") sessionId: string, @Body() body: unknown): Promise<EventResponse> {
    return this.execution.createEvent(await this.staffAccess.resolveExecutionWrite(headers), sessionId, parseEventInput(body))
  }

  @Post("sessions/:sessionId/daily-reports/:reportId/public-summary")
  async publishDaily(@Headers() headers: RequestHeaders, @Param("sessionId") sessionId: string, @Param("reportId") reportId: string, @Body() body: unknown): Promise<DailyReportResponse> {
    return this.execution.approveDailySummary(await this.staffAccess.resolveExecutionWrite(headers), sessionId, reportId, parsePublicApproval(body))
  }

  @Post("sessions/:sessionId/events/:eventId/public-summary")
  async publishEvent(@Headers() headers: RequestHeaders, @Param("sessionId") sessionId: string, @Param("eventId") eventId: string, @Body() body: unknown): Promise<EventResponse> {
    return this.execution.approveEventSummary(await this.staffAccess.resolveExecutionWrite(headers), sessionId, eventId, parsePublicApproval(body))
  }

  @Get("sessions/:sessionId/people/:personRef/health")
  async health(@Headers() headers: RequestHeaders, @Param("sessionId") sessionId: string, @Param("personRef") personRef: string): Promise<HealthReadResponse> {
    return this.execution.readHealth(await this.staffAccess.resolve(headers), sessionId, parsePersonRef(personRef))
  }
}

@Controller("orders")
export class FamilyExecutionController {
  constructor(
    @Inject(EnrollmentIdentityService) private readonly identity: EnrollmentIdentityService,
    @Inject(ExecutionService) private readonly execution: ExecutionService,
  ) {}

  @Get(":orderId/execution/public-summary")
  async publicSummary(@Headers() headers: RequestHeaders, @Param("orderId") orderId: string): Promise<FamilyPublicSummary> {
    return this.execution.familyPublicSummary(await this.identity.resolve(headers), orderId)
  }

  @Post(":orderId/execution/health-authorizations")
  async authorizeHealth(@Headers() headers: RequestHeaders, @Param("orderId") orderId: string, @Body() body: unknown): Promise<HealthAuthorizationResponse> {
    return this.execution.authorizeHealth(await this.identity.resolve(headers), orderId, parseHealthAuthorization(body))
  }

  @Post(":orderId/execution/health-authorizations/:personRef/revoke")
  async revokeHealth(@Headers() headers: RequestHeaders, @Param("orderId") orderId: string, @Param("personRef") personRef: string): Promise<HealthAuthorizationResponse> {
    return this.execution.revokeHealth(await this.identity.resolve(headers), orderId, parsePersonRef(personRef))
  }
}
