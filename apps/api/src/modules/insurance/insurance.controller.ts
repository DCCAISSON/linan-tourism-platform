import { Body, Controller, Get, Headers, Inject, Param, Post, Query, Res } from "@nestjs/common"
import type { Response } from "express"
import { DevStaffAccessService } from "../iam/dev-staff-access.service.js"
import { InsuranceService } from "./insurance.service.js"
import { parseChangeHandoff, parseCreateBatch, parseExportQuery, parseManualResult, parseSubmitBatch } from "./insurance.parser.js"
import { createInsuranceWorkbook } from "./insurance.workbook.js"
import type { InsuranceBatchSnapshot, InsurancePreview, InsuranceRosterDiff } from "./insurance.types.js"

type RequestHeaders = Record<string, string | readonly string[] | undefined>

@Controller("insurance")
export class InsuranceController {
  constructor(
    @Inject(InsuranceService) private readonly insurance: InsuranceService,
    @Inject(DevStaffAccessService) private readonly staffAccess: DevStaffAccessService,
  ) {}

  @Get("sessions/:tourSessionId/latest")
  async latest(@Headers() headers: RequestHeaders, @Param("tourSessionId") tourSessionId: string): Promise<InsuranceBatchSnapshot | null> {
    return this.insurance.latest(await this.staffAccess.resolve(headers), tourSessionId)
  }

  @Get("sessions/:tourSessionId/preview")
  async preview(@Headers() headers: RequestHeaders, @Param("tourSessionId") tourSessionId: string): Promise<InsurancePreview> {
    return this.insurance.preview(await this.staffAccess.resolve(headers), tourSessionId)
  }

  @Post("batches")
  async createBatch(@Headers() headers: RequestHeaders, @Body() body: unknown): Promise<InsuranceBatchSnapshot> {
    this.staffAccess.assertUnsafeOrigin(headers)
    return this.insurance.createBatch(await this.staffAccess.resolve(headers), parseCreateBatch(body))
  }

  @Get("batches/:batchId/diff")
  async diff(@Headers() headers: RequestHeaders, @Param("batchId") batchId: string): Promise<InsuranceRosterDiff> {
    return this.insurance.diff(await this.staffAccess.resolve(headers), batchId)
  }

  @Post("batches/:batchId/submit")
  async submit(@Headers() headers: RequestHeaders, @Param("batchId") batchId: string, @Body() body: unknown): Promise<InsuranceBatchSnapshot> {
    this.staffAccess.assertUnsafeOrigin(headers)
    return this.insurance.submitBatch(await this.staffAccess.resolve(headers), batchId, parseSubmitBatch(body))
  }

  @Post("batches/:batchId/manual-result")
  async manualResult(@Headers() headers: RequestHeaders, @Param("batchId") batchId: string, @Body() body: unknown): Promise<InsuranceBatchSnapshot> {
    this.staffAccess.assertUnsafeOrigin(headers)
    return this.insurance.recordManualResult(await this.staffAccess.resolve(headers), batchId, parseManualResult(body))
  }

  @Post("batches/:batchId/change-handoffs")
  async changeHandoff(@Headers() headers: RequestHeaders, @Param("batchId") batchId: string, @Body() body: unknown): Promise<InsuranceBatchSnapshot> {
    this.staffAccess.assertUnsafeOrigin(headers)
    return this.insurance.createChangeHandoff(await this.staffAccess.resolve(headers), batchId, parseChangeHandoff(body))
  }

  @Get("batches/:batchId/export.xlsx")
  async export(@Headers() headers: RequestHeaders, @Param("batchId") batchId: string, @Query() query: unknown, @Res() response: Response): Promise<void> {
    const options = parseExportQuery(query)
    const rows = await this.insurance.exportRows(await this.staffAccess.resolve(headers), batchId, options.kind, options.sensitive)
    const workbook = await createInsuranceWorkbook(rows, options.kind)
    response
      .status(200)
      .setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .setHeader("Content-Disposition", 'attachment; filename="insurance-roster.xlsx"')
      .send(workbook)
  }
}
