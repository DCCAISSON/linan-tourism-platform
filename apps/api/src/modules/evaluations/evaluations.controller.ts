import { Body, Controller, Get, Headers, Inject, Param, Post, Query, Res } from "@nestjs/common"
import type { Response } from "express"
import { DevStaffAccessService } from "../iam/dev-staff-access.service.js"
import type { StaffAccessRequestHeaders } from "../iam/dev-staff-access.service.js"
import {
  parseBatchEvaluation,
  parseEvaluationRevision,
  parseEvaluationStandard,
  parseStandardConfirmation,
} from "./evaluations.parser.js"
import { EvaluationsService } from "./evaluations.service.js"

@Controller("evaluations")
export class EvaluationsController {
  constructor(
    @Inject(EvaluationsService) private readonly evaluations: EvaluationsService,
    @Inject(DevStaffAccessService) private readonly access: DevStaffAccessService,
  ) {}

  @Get("sessions")
  async sessions(@Headers() headers: StaffAccessRequestHeaders) {
    return this.evaluations.sessions(await this.access.resolve(headers))
  }

  @Get("staff/sessions/:sessionId")
  async dashboard(@Headers() headers: StaffAccessRequestHeaders, @Param("sessionId") sessionId: string) {
    return this.evaluations.dashboard(await this.access.resolve(headers), sessionId)
  }

  @Post("staff/standards")
  async createStandard(@Headers() headers: StaffAccessRequestHeaders, @Body() body: unknown) {
    this.access.assertUnsafeOrigin(headers)
    return this.evaluations.createStandard(await this.access.resolve(headers), parseEvaluationStandard(body))
  }

  @Get("staff/sessions/:sessionId/standards")
  async standards(@Headers() headers: StaffAccessRequestHeaders, @Param("sessionId") sessionId: string) {
    return this.evaluations.standards(await this.access.resolve(headers), sessionId)
  }

  @Post("staff/standards/:id/confirm")
  async confirmStandard(@Headers() headers: StaffAccessRequestHeaders, @Param("id") id: string, @Body() body: unknown) {
    this.access.assertUnsafeOrigin(headers)
    return this.evaluations.confirmStandard(await this.access.resolve(headers), id, parseStandardConfirmation(body))
  }

  @Post("staff/batch")
  async batch(@Headers() headers: StaffAccessRequestHeaders, @Body() body: unknown) {
    return this.evaluations.batchEvaluate(await this.access.resolveExecutionWrite(headers), parseBatchEvaluation(body))
  }

  @Post("staff/:id")
  async revise(@Headers() headers: StaffAccessRequestHeaders, @Param("id") id: string, @Body() body: unknown) {
    return this.evaluations.revise(await this.access.resolveExecutionWrite(headers), id, parseEvaluationRevision(body))
  }

  @Post("staff/sessions/:sessionId/confirm")
  async confirmSession(@Headers() headers: StaffAccessRequestHeaders, @Param("sessionId") sessionId: string) {
    return this.evaluations.confirmSession(await this.access.resolveExecutionWrite(headers), sessionId)
  }

  @Get("school/sessions/:sessionId")
  async schoolRows(@Headers() headers: StaffAccessRequestHeaders, @Param("sessionId") sessionId: string, @Query("organizationId") organizationId: string) {
    return this.evaluations.schoolRows(await this.access.resolve(headers), sessionId, organizationId)
  }

  @Get("school/sessions/:sessionId/report")
  async report(@Headers() headers: StaffAccessRequestHeaders, @Param("sessionId") sessionId: string, @Query("organizationId") organizationId: string, @Query("format") format: string | undefined, @Res() response: Response) {
    const result = await this.evaluations.schoolReport(await this.access.resolve(headers), sessionId, organizationId, format === "wordxml" ? "wordxml" : "xlsx")
    response.setHeader("Content-Type", result.contentType)
    response.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`)
    response.setHeader("X-Linan-Report-Format", format === "wordxml" ? "wordxml" : "xlsx")
    response.send(result.body)
  }
}
